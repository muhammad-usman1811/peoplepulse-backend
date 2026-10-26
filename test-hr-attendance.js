const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { DateTime } = require('luxon');

// Database-free: requests go through the real app (protect, authorize, routing,
// ApiResponse) while the Attendance and User models are served from memory.
process.env.NODE_ENV = 'test';
process.env.APP_TIMEZONE = 'Asia/Karachi';
mongoose.connect = async () => ({ connection: { host: 'stub', name: 'stub' } });
const app = require('./src/server');
const User = require('./src/models/User');
const Attendance = require('./src/models/Attendance');
const { getJwtSecret } = require('./src/config/security');

const ZONE = 'Asia/Karachi';
const ENDPOINT = '/api/v1/attendance';
const original = {
  findById: User.findById,
  findOne: Attendance.findOne,
  find: Attendance.find,
  countDocuments: Attendance.countDocuments,
};

const objectId = (n) => new mongoose.Types.ObjectId(n.toString(16).padStart(24, '0'));
// Attendance.date is stored as local midnight in UTC, as clockIn() writes it
const localDay = (iso) => DateTime.fromISO(iso, { zone: ZONE }).startOf('day').toUTC().toJSDate();
const localTime = (iso, time) => DateTime.fromISO(`${iso}T${time}`, { zone: ZONE }).toUTC().toJSDate();
const today = () => DateTime.now().setZone(ZONE);

const SENSITIVE_EMPLOYEE_FIELDS = {
  email: 'private.person@example.test',
  phoneNumber: '+92 300 0000000',
  password: '$2a$12$hashedpasswordvalue',
  monthlySalary: 250000,
  salaryStructure: objectId(9001),
  resetPasswordToken: 'reset-token-hash',
  tokenVersion: 3,
  manager: objectId(9002),
  notificationPreferences: { email: true, push: true },
};

const employees = new Map();
const addEmployee = (n, employeeId, name, department = 'Engineering', designation = 'Engineer') => {
  const _id = objectId(n);
  employees.set(String(_id), {
    _id,
    employeeId,
    name,
    department,
    designation,
    role: 'employee',
    isActive: true,
    ...SENSITIVE_EMPLOYEE_FIELDS,
  });
  return _id;
};

const accounts = new Map();
const tokenFor = (role, overrides = {}) => {
  const user = { _id: new mongoose.Types.ObjectId(), role, isActive: true, tokenVersion: 0, ...overrides };
  accounts.set(String(user._id), user);
  return jwt.sign({ id: user._id, role, tokenVersion: user.tokenVersion }, getJwtSecret(), { expiresIn: '1h' });
};

// --- In-memory Attendance store with the Mongo semantics the endpoint relies on ---
let records = [];
let queries;

const matches = (record, filter = {}) =>
  Object.entries(filter).every(([field, condition]) => {
    const value = record[field];
    if (condition && typeof condition === 'object' && !(condition instanceof Date)) {
      if (condition.$gte !== undefined && !(value >= condition.$gte)) return false;
      if (condition.$lte !== undefined && !(value <= condition.$lte)) return false;
      return true;
    }
    return String(value) === String(condition);
  });

const sortKey = (value) => {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return `1${String(value.getTime()).padStart(16, '0')}`;
  return `1${String(value)}`;
};

// Mongo sorts null before any value, and ObjectIds by their hex order
const applySort = (list, spec) =>
  spec
    ? [...list].sort((a, b) => {
        for (const [field, direction] of Object.entries(spec)) {
          const left = sortKey(a[field]);
          const right = sortKey(b[field]);
          if (left !== right) return (left < right ? -1 : 1) * direction;
        }
        return 0;
      })
    : list;

const fakeQuery = (resolve) => {
  const state = { sort: null, skip: 0, limit: Infinity, select: null, populate: null };
  const query = {
    sort(spec) {
      state.sort = spec;
      return query;
    },
    skip(n) {
      state.skip = n;
      return query;
    },
    limit(n) {
      state.limit = n;
      return query;
    },
    select(fields) {
      state.select = fields;
      return query;
    },
    populate(path, fields) {
      state.populate = { path, fields };
      return query;
    },
    then(onFulfilled, onRejected) {
      return Promise.resolve()
        .then(() => resolve(state))
        .then(onFulfilled, onRejected);
    },
  };
  return query;
};

const installStores = () => {
  User.findById = async (id) => accounts.get(String(id)) || null;
  Attendance.findOne = (filter) => {
    queries.push({ op: 'findOne', filter });
    return fakeQuery(
      (state) =>
        applySort(
          records.filter((r) => matches(r, filter)),
          state.sort
        )[0] || null
    );
  };
  Attendance.countDocuments = async (filter) => {
    queries.push({ op: 'countDocuments', filter });
    return records.filter((r) => matches(r, filter)).length;
  };
  Attendance.find = (filter) =>
    fakeQuery((state) => {
      queries.push({ op: 'find', filter, state });
      const page = applySort(
        records.filter((r) => matches(r, filter)),
        state.sort
      ).slice(state.skip, state.skip + state.limit);
      if (!state.populate) return page;
      return page.map((r) => ({ ...r, employee: employees.get(String(r.employee)) || null }));
    });
};

// --- Fixtures ---
const ayesha = addEmployee(1, 'EMP-1001', 'Ayesha Khan', 'Engineering', 'Software Engineer');
const bilal = addEmployee(2, 'EMP-1002', 'Bilal Ahmed', 'Finance', 'Accountant');
const sara = addEmployee(3, 'EMP-1003', 'Sara Malik', 'HR', 'HR Officer');
const usman = addEmployee(4, 'EMP-1004', 'Usman Ali', 'Sales', 'Sales Executive');

const attendance = (n, employee, day, clockIn, extra = {}) => ({
  _id: objectId(0x1000 + n),
  employee,
  date: localDay(day),
  clockIn: clockIn ? localTime(day, clockIn) : null,
  clockOut: null,
  status: 'present',
  isLate: false,
  isHalfDay: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  __v: 0,
  ...extra,
});

const OLDER_DAY = '2025-03-10';
const LATEST_DAY = '2025-03-12';
const EMPTY_DAY = '2025-03-11';

const fixtureRecords = () => {
  const future = today().plus({ days: 2 }).toISODate();
  return [
    attendance(1, ayesha, OLDER_DAY, '08:55'),
    attendance(2, bilal, OLDER_DAY, '09:20', { status: 'late', isLate: true }),
    // Latest day: two employees share a clock-in time, one is absent (no clock-in)
    attendance(10, usman, LATEST_DAY, '09:15', { status: 'late', isLate: true }),
    attendance(11, ayesha, LATEST_DAY, '08:45', { clockOut: localTime(LATEST_DAY, '17:05') }),
    attendance(13, sara, LATEST_DAY, '08:50'),
    attendance(12, bilal, LATEST_DAY, '08:50', { status: 'half-day', isHalfDay: true }),
    attendance(14, objectId(999), LATEST_DAY, null, { status: 'absent' }),
    // Bad data dated after today must never become the default day
    attendance(20, ayesha, future, '09:00'),
  ];
};

let server;
let baseUrl;
let hrToken;

const get = async (path, token = hrToken) => {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  return { status: response.status, body: await response.json() };
};

test.before(async () => {
  server = await new Promise((resolve) => {
    const listener = app.listen(0, () => resolve(listener));
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  User.findById = original.findById;
  Attendance.findOne = original.findOne;
  Attendance.find = original.find;
  Attendance.countDocuments = original.countDocuments;
  await new Promise((resolve) => server.close(resolve));
});

test.beforeEach(() => {
  records = fixtureRecords();
  queries = [];
  accounts.clear();
  installStores();
  hrToken = tokenFor('hr');
});

// --- 200: successful cases ---

test('without a date it lists the latest day that has attendance, ignoring future-dated rows', async () => {
  const res = await get(ENDPOINT);

  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.message, 'Attendance records retrieved successfully.');
  assert.equal(res.body.data.date, LATEST_DAY);
  assert.equal(res.body.data.records.length, 5);
  assert.ok(res.body.data.records.every((record) => record.date === LATEST_DAY));
  assert.deepEqual(res.body.data.pagination, { page: 1, limit: 10, totalRecords: 5, totalPages: 1 });
});

test('without a date and with no attendance at all it returns an empty list', async () => {
  records = [];
  const res = await get(ENDPOINT);

  assert.equal(res.status, 200);
  assert.deepEqual(res.body.data, {
    date: null,
    records: [],
    pagination: { page: 1, limit: 10, totalRecords: 0, totalPages: 0 },
  });
});

test("a specific date returns only that day's records", async () => {
  const res = await get(`${ENDPOINT}?date=${OLDER_DAY}`);

  assert.equal(res.status, 200);
  assert.equal(res.body.data.date, OLDER_DAY);
  assert.deepEqual(
    res.body.data.records.map((r) => r.employee.employeeId),
    ['EMP-1001', 'EMP-1002']
  );
  assert.deepEqual(
    res.body.data.records.map((r) => r.status),
    ['present', 'late']
  );
  assert.deepEqual(res.body.data.pagination, { page: 1, limit: 10, totalRecords: 2, totalPages: 1 });
  // The local day is queried as its full UTC span, so early and late clock-ins are both included
  const { filter } = queries.find((q) => q.op === 'countDocuments');
  assert.deepEqual(filter.date, {
    $gte: localDay(OLDER_DAY),
    $lte: DateTime.fromISO(OLDER_DAY, { zone: ZONE }).endOf('day').toUTC().toJSDate(),
  });
  assert.equal(
    queries.some((q) => q.op === 'findOne'),
    false,
    'an explicit date must not look up the latest day'
  );
});

test('today is accepted as a date', async () => {
  const res = await get(`${ENDPOINT}?date=${today().toISODate()}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.data.date, today().toISODate());
});

test('a date with no attendance returns an empty records array', async () => {
  const res = await get(`${ENDPOINT}?date=${EMPTY_DAY}`);

  assert.equal(res.status, 200);
  assert.equal(res.body.data.date, EMPTY_DAY);
  assert.deepEqual(res.body.data.records, []);
  assert.deepEqual(res.body.data.pagination, { page: 1, limit: 10, totalRecords: 0, totalPages: 0 });
});

test('pagination returns the requested slice with correct metadata', async () => {
  const page1 = await get(`${ENDPOINT}?date=${LATEST_DAY}&page=1&limit=2`);
  const page2 = await get(`${ENDPOINT}?date=${LATEST_DAY}&page=2&limit=2`);
  const page3 = await get(`${ENDPOINT}?date=${LATEST_DAY}&page=3&limit=2`);

  for (const res of [page1, page2, page3]) assert.equal(res.status, 200);
  assert.deepEqual(page1.body.data.pagination, { page: 1, limit: 2, totalRecords: 5, totalPages: 3 });
  assert.deepEqual(page2.body.data.pagination, { page: 2, limit: 2, totalRecords: 5, totalPages: 3 });
  assert.deepEqual(page3.body.data.pagination, { page: 3, limit: 2, totalRecords: 5, totalPages: 3 });
  assert.equal(page1.body.data.records.length, 2);
  assert.equal(page2.body.data.records.length, 2);
  assert.equal(page3.body.data.records.length, 1);

  const ids = [page1, page2, page3].flatMap((res) => res.body.data.records.map((r) => r.id));
  const all = await get(`${ENDPOINT}?date=${LATEST_DAY}&limit=50`);
  assert.deepEqual(
    ids,
    all.body.data.records.map((r) => r.id),
    'pages concatenate to the full ordered list'
  );
  assert.equal(new Set(ids).size, 5, 'no record appears on two pages');
});

test('a page past the end is empty but keeps accurate totals', async () => {
  const res = await get(`${ENDPOINT}?date=${LATEST_DAY}&page=4&limit=2`);

  assert.equal(res.status, 200);
  assert.deepEqual(res.body.data.records, []);
  assert.deepEqual(res.body.data.pagination, { page: 4, limit: 2, totalRecords: 5, totalPages: 3 });
});

test('limit defaults to 10 and accepts the maximum of 50', async () => {
  records = Array.from({ length: 55 }, (_, i) => attendance(100 + i, ayesha, OLDER_DAY, '09:00'));

  const byDefault = await get(`${ENDPOINT}?date=${OLDER_DAY}`);
  assert.equal(byDefault.body.data.records.length, 10);
  assert.deepEqual(byDefault.body.data.pagination, { page: 1, limit: 10, totalRecords: 55, totalPages: 6 });

  const max = await get(`${ENDPOINT}?date=${OLDER_DAY}&limit=50&page=2`);
  assert.equal(max.status, 200);
  assert.equal(max.body.data.records.length, 5);
  assert.deepEqual(max.body.data.pagination, { page: 2, limit: 50, totalRecords: 55, totalPages: 2 });
});

test('records are sorted by clock-in time with the record ID breaking ties, identically on every request', async () => {
  const first = await get(`${ENDPOINT}?date=${LATEST_DAY}`);
  records.reverse(); // storage order must not matter
  const second = await get(`${ENDPOINT}?date=${LATEST_DAY}`);

  const expected = [
    objectId(0x1000 + 14), // absent: no clock-in sorts first, as in MongoDB
    objectId(0x1000 + 11), // 08:45
    objectId(0x1000 + 12), // 08:50, lower _id
    objectId(0x1000 + 13), // 08:50, higher _id
    objectId(0x1000 + 10), // 09:15
  ].map(String);
  assert.deepEqual(
    first.body.data.records.map((r) => r.id),
    expected
  );
  assert.deepEqual(
    second.body.data.records.map((r) => r.id),
    expected
  );
  const { state } = queries.find((q) => q.op === 'find');
  assert.deepEqual(state.sort, { clockIn: 1, _id: 1 });
});

test('each record exposes only the required attendance and employee fields', async () => {
  const res = await get(`${ENDPOINT}?date=${LATEST_DAY}`);
  const ayeshaRecord = res.body.data.records.find((r) => r.employee && r.employee.employeeId === 'EMP-1001');

  assert.deepEqual(ayeshaRecord, {
    id: String(objectId(0x1000 + 11)),
    employee: {
      id: String(ayesha),
      employeeId: 'EMP-1001',
      name: 'Ayesha Khan',
      department: 'Engineering',
      designation: 'Software Engineer',
    },
    date: LATEST_DAY,
    clockIn: localTime(LATEST_DAY, '08:45').toISOString(),
    clockOut: localTime(LATEST_DAY, '17:05').toISOString(),
    status: 'present',
    isLate: false,
    isHalfDay: false,
  });

  const payload = JSON.stringify(res.body);
  for (const [field, value] of Object.entries(SENSITIVE_EMPLOYEE_FIELDS)) {
    assert.equal(payload.includes(`"${field}"`), false, `${field} must not be in the response`);
    if (typeof value === 'string') assert.equal(payload.includes(value), false, `${field} value leaked`);
  }
  for (const field of ['__v', 'createdAt', 'updatedAt', 'role', 'isActive']) {
    assert.equal(payload.includes(`"${field}"`), false, `${field} must not be in the response`);
  }

  const { state } = queries.find((q) => q.op === 'find');
  assert.deepEqual(state.populate, { path: 'employee', fields: 'name employeeId department designation' });
});

test('a record whose employee no longer exists is returned with employee null', async () => {
  const res = await get(`${ENDPOINT}?date=${LATEST_DAY}`);
  const orphan = res.body.data.records.find((r) => r.id === String(objectId(0x1000 + 14)));
  assert.equal(orphan.employee, null);
  assert.equal(orphan.status, 'absent');
  assert.equal(orphan.clockIn, null);
});

// --- 400: invalid query parameters ---

const expectBadRequest = async (query, message) => {
  const res = await get(`${ENDPOINT}?${query}`);
  assert.equal(res.status, 400, `${query} should be rejected`);
  assert.deepEqual(res.body, { success: false, message }, `${query} returned the wrong error`);
  assert.deepEqual(queries, [], `${query} must be rejected before touching the database`);
};

test('an invalid date format returns 400 with a readable message', async () => {
  const message = 'date must be a valid calendar date in YYYY-MM-DD format';
  for (const query of [
    'date=2025-3-10',
    'date=10-03-2025',
    'date=2025/03/10',
    'date=2025-03-10T00:00:00Z',
    'date=20250310',
    'date=yesterday',
    'date=',
    'date=2025-02-30',
    'date=2025-13-01',
    'date=2025-03-10&date=2025-03-11',
  ]) {
    queries = [];
    await expectBadRequest(query, message);
  }
});

test('a future date returns 400', async () => {
  await expectBadRequest(`date=${today().plus({ days: 1 }).toISODate()}`, 'date cannot be in the future');
  queries = [];
  await expectBadRequest(`date=${today().plus({ years: 1 }).toISODate()}`, 'date cannot be in the future');
});

test('an invalid page returns 400', async () => {
  for (const page of ['0', '-1', '1.5', 'abc', '', '1e2', ' 1', '99999999999999999999']) {
    queries = [];
    await expectBadRequest(`page=${encodeURIComponent(page)}`, 'page must be a positive integer (minimum 1)');
  }
  queries = [];
  await expectBadRequest('page=1&page=2', 'page must be a positive integer (minimum 1)');
});

test('an invalid limit returns 400', async () => {
  for (const limit of ['0', '51', '100', '-5', '2.5', 'ten', '']) {
    queries = [];
    await expectBadRequest(`limit=${encodeURIComponent(limit)}`, 'limit must be an integer between 1 and 50');
  }
});

// --- 401 / 403: authentication and authorization ---

test('a request without a token returns 401', async () => {
  const res = await get(ENDPOINT, null);
  assert.equal(res.status, 401);
  assert.deepEqual(res.body, { success: false, message: 'Access denied. No authentication token provided.' });
  assert.deepEqual(queries, []);
});

test('invalid, expired, and forged tokens return 401', async () => {
  const hr = { _id: new mongoose.Types.ObjectId(), role: 'hr', isActive: true, tokenVersion: 0 };
  accounts.set(String(hr._id), hr);
  const expired = jwt.sign({ id: hr._id, tokenVersion: 0 }, getJwtSecret(), { expiresIn: -10 });
  const forged = jwt.sign({ id: hr._id, tokenVersion: 0 }, 'not-the-server-secret');
  const unknownUser = jwt.sign({ id: new mongoose.Types.ObjectId(), tokenVersion: 0 }, getJwtSecret());
  const revoked = jwt.sign({ id: hr._id, tokenVersion: 0 }, getJwtSecret());
  hr.tokenVersion = 1;

  for (const token of ['not-a-jwt', expired, forged, unknownUser, revoked]) {
    const res = await get(ENDPOINT, token);
    assert.equal(res.status, 401);
    assert.equal(res.body.success, false);
    assert.equal(typeof res.body.message, 'string');
  }
  assert.deepEqual(queries, []);
});

test('authentication is checked before query validation', async () => {
  const res = await get(`${ENDPOINT}?date=bad&page=0`, null);
  assert.equal(res.status, 401);
});

test('every non-HR role receives 403, including admin and superadmin', async () => {
  for (const role of ['employee', 'finance', 'admin', 'superadmin']) {
    const res = await get(ENDPOINT, tokenFor(role));
    assert.equal(res.status, 403, `${role} must be forbidden`);
    assert.deepEqual(res.body, {
      success: false,
      message: `User role '${role}' is not authorized to access this resource`,
    });
  }
  assert.deepEqual(queries, []);
});

test('role is read from the database, not trusted from the token', async () => {
  const token = tokenFor('employee');
  const forgedRole = jwt.sign({ ...jwt.decode(token), role: 'hr' }, getJwtSecret());
  const res = await get(ENDPOINT, forgedRole);
  assert.equal(res.status, 403);
});

test('a deactivated HR account receives 403', async () => {
  const res = await get(ENDPOINT, tokenFor('hr', { isActive: false }));
  assert.equal(res.status, 403);
  assert.deepEqual(queries, []);
});

test('authorization is checked before query validation', async () => {
  const res = await get(`${ENDPOINT}?date=bad`, tokenFor('employee'));
  assert.equal(res.status, 403);
});

test('only GET is exposed on the HR attendance list', async () => {
  const response = await fetch(`${baseUrl}${ENDPOINT}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${hrToken}` },
  });
  assert.equal(response.status, 404);
});

test('the existing /api/attendance admin query keeps its access rules', async () => {
  const res = await get('/api/attendance?limit=200', tokenFor('admin'));
  // admin still passes authorization there; the 400 comes from that endpoint's own limit rule
  assert.equal(res.status, 400);
  assert.equal(res.body.message, 'limit must be an integer between 1 and 100');
});
