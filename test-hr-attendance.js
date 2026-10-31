const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { DateTime } = require('luxon');
const { Readable } = require('node:stream');
const { once } = require('node:events');
const zlib = require('node:zlib');

// Database-free: requests go through the real app (protect, authorize, routing,
// ApiResponse) while the Attendance and User models are served from memory.
process.env.NODE_ENV = 'test';
process.env.APP_TIMEZONE = 'Asia/Karachi';
mongoose.connect = async () => ({ connection: { host: 'stub', name: 'stub' } });
const app = require('./src/server');
const User = require('./src/models/User');
const Attendance = require('./src/models/Attendance');
const { getJwtSecret } = require('./src/config/security');
const { encrypt } = require('./src/utils/cryptoUtils');

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

// Builds the stream that .cursor() returns from the matching records; tests replace it
// to simulate database failures and long-running cursors.
const defaultCursor = (docs) => {
  const cursor = Readable.from(docs);
  // Mongoose's QueryCursor overrides for-await to read with next(), bypassing documents the
  // export has already buffered in the stream; fail loudly if the export ever relies on it.
  cursor[Symbol.asyncIterator] = () => {
    throw new Error('QueryCursor[Symbol.asyncIterator] skips buffered documents');
  };
  return cursor;
};
let makeCursor = defaultCursor;

const fakeQuery = (resolve) => {
  const state = { sort: null, skip: 0, limit: Infinity, select: null, populate: null, lean: false, cursor: null };
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
    lean() {
      state.lean = true;
      return query;
    },
    cursor(options) {
      state.cursor = options;
      return makeCursor(resolve(state));
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
  makeCursor = defaultCursor;
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

// --- Export route: auth, role, and validation order ---

const EXPORT_ENDPOINT = `${ENDPOINT}/export`;

test('export without a token returns 401, even with an invalid query', async () => {
  const res = await get(`${EXPORT_ENDPOINT}?format=xlsx`, null);
  assert.equal(res.status, 401);
  assert.deepEqual(res.body, { success: false, message: 'Access denied. No authentication token provided.' });
});

test('export with an invalid token returns 401', async () => {
  const res = await get(`${EXPORT_ENDPOINT}?format=csv&date=2025-03-12`, 'not-a-jwt');
  assert.equal(res.status, 401);
});

test('export is forbidden to every role except hr and admin, before query validation', async () => {
  for (const role of ['employee', 'finance', 'superadmin']) {
    const res = await get(`${EXPORT_ENDPOINT}?format=xlsx`, tokenFor(role));
    assert.equal(res.status, 403, `${role} must be forbidden`);
    assert.deepEqual(res.body, {
      success: false,
      message: `User role '${role}' is not authorized to access this resource`,
    });
  }
});

test('export rejects an invalid query with 400 for hr and admin', async () => {
  for (const role of ['hr', 'admin']) {
    const res = await get(`${EXPORT_ENDPOINT}?format=xlsx&date=2026-02-31`, tokenFor(role));
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, {
      success: false,
      message: "format is required and must be 'csv' or 'pdf'; date is required and must be a valid date in YYYY-MM-DD format",
    });
  }
});

// --- Export: CSV streaming ---

const BOM = '﻿';
const CSV_HEADER = 'Employee Name,Employee ID,Date,Check In,Check Out,Status,Working Hours\n';
// LATEST_DAY in clock-in order: the absent row (null clock-in) sorts first, and the
// 08:50 tie is broken by record ID (Bilal 12 before Sara 13), exactly as the HR list orders them.
const LATEST_DAY_CSV = CSV_HEADER
  + ',,2025-03-12,,,absent,\n'
  + 'Ayesha Khan,EMP-1001,2025-03-12,08:45 AM,05:05 PM,present,8h 20m\n'
  + 'Bilal Ahmed,EMP-1002,2025-03-12,08:50 AM,,half-day,\n'
  + 'Sara Malik,EMP-1003,2025-03-12,08:50 AM,,present,\n'
  + 'Usman Ali,EMP-1004,2025-03-12,09:15 AM,,late,\n';

const download = async (path, token = hrToken) => {
  const response = await fetch(`${baseUrl}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  // Decoded by hand: response.text() would silently drop the BOM under test.
  return { status: response.status, headers: response.headers, text: Buffer.from(await response.arrayBuffer()).toString('utf8') };
};

// Captures console.error so expected failures stay out of the test output.
const captureErrors = () => {
  const logged = [];
  const original = console.error;
  console.error = (...args) => logged.push(args);
  return { logged, restore: () => { console.error = original; } };
};

test('csv export streams every record for the day with download headers', async () => {
  for (const role of ['hr', 'admin']) {
    const res = await download(`${EXPORT_ENDPOINT}?format=csv&date=${LATEST_DAY}`, tokenFor(role));
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'text/csv; charset=utf-8');
    assert.equal(res.headers.get('content-disposition'), `attachment; filename="attendance-report-${LATEST_DAY}.csv"`);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.equal(res.text, BOM + LATEST_DAY_CSV);
  }
});

test('csv export reads through a lean cursor with the same filter and order as the HR list, unpaginated', async () => {
  await get(`${ENDPOINT}?date=${LATEST_DAY}&limit=2`);
  const listFind = queries.find((q) => q.op === 'find');
  queries = [];

  await download(`${EXPORT_ENDPOINT}?format=csv&date=${LATEST_DAY}&page=3&limit=2`);
  assert.deepEqual(queries.map((q) => q.op), ['find'], 'no count or array-loading query');
  const [exportFind] = queries;

  assert.deepEqual(exportFind.filter, listFind.filter);
  assert.deepEqual(exportFind.state.sort, listFind.state.sort);
  assert.deepEqual(exportFind.state.cursor, { batchSize: 500 });
  assert.equal(exportFind.state.lean, true);
  assert.equal(exportFind.state.skip, 0);
  assert.equal(exportFind.state.limit, Infinity);
  assert.deepEqual(exportFind.state.populate, { path: 'employee', fields: 'name employeeId' });
});

test('each invalid export query returns 400 with a readable message', async () => {
  const FORMAT = "format is required and must be 'csv' or 'pdf'";
  const DATE = 'date is required and must be a valid date in YYYY-MM-DD format';
  const cases = [
    [`date=${LATEST_DAY}`, FORMAT], // missing format
    [`format=xlsx&date=${LATEST_DAY}`, FORMAT],
    ['format=csv', DATE], // missing date
    ['format=csv&date=2026-13-45', DATE],
    ['format=csv&date=30-10-2026', DATE],
    // Same rule and message as the HR list, so the export never offers a day the list refuses
    [`format=csv&date=${today().plus({ days: 1 }).toISODate()}`, 'date cannot be in the future'],
  ];
  for (const [query, message] of cases) {
    const res = await get(`${EXPORT_ENDPOINT}?${query}`);
    assert.equal(res.status, 400, query);
    assert.deepEqual(res.body, { success: false, message }, query);
  }
  assert.deepEqual(queries, [], 'invalid queries never reach the database');
});

test('browser clients can read the download filename through CORS', async () => {
  const response = await fetch(`${baseUrl}${EXPORT_ENDPOINT}?format=csv&date=${LATEST_DAY}`, {
    headers: { Authorization: `Bearer ${hrToken}`, Origin: 'http://localhost:3000' },
  });
  await response.arrayBuffer();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:3000');
  assert.equal(response.headers.get('access-control-expose-headers'), 'Content-Disposition');
});

test('a database outage during authentication returns 500, not an invalid-token 401', async () => {
  User.findById = async () => {
    throw new Error('Server selection timed out after 30000 ms');
  };
  const errors = captureErrors();
  try {
    const res = await get(`${EXPORT_ENDPOINT}?format=csv&date=${LATEST_DAY}`);
    assert.equal(res.status, 500);
    assert.equal(res.body.success, false);
    assert.notEqual(res.body.message, 'Invalid authentication token.');
    assert.deepEqual(queries, [], 'the export never starts');
  } finally {
    errors.restore();
  }
});

test('csv export ignores page and limit: the file is identical with or without them', async () => {
  const plain = await download(`${EXPORT_ENDPOINT}?format=csv&date=${LATEST_DAY}`);
  for (const extra of ['page=2&limit=1', 'page=0&limit=abc', 'limit=1000000']) {
    const res = await download(`${EXPORT_ENDPOINT}?format=csv&date=${LATEST_DAY}&${extra}`);
    assert.equal(res.status, 200, extra);
    assert.equal(res.text, plain.text, extra);
  }
});

test('exports decrypt employee names, which are encrypted at rest and skipped by lean() getters', async () => {
  const stored = encrypt('Zainab Qureshi');
  assert.notEqual(stored, 'Zainab Qureshi');
  const zainab = addEmployee(70, 'EMP-1070', stored);
  records = [attendance(70, zainab, EMPTY_DAY, '09:00')];

  const csv = await download(`${EXPORT_ENDPOINT}?format=csv&date=${EMPTY_DAY}`);
  assert.equal(csv.text, `${BOM}${CSV_HEADER}Zainab Qureshi,EMP-1070,2025-03-11,09:00 AM,,present,\n`);

  const pdf = await downloadPdf(`${EXPORT_ENDPOINT}?format=pdf&date=${EMPTY_DAY}`);
  assert.ok(pdfPages(pdf.body)[0].includes('Zainab Qureshi'));
  assert.ok(!pdf.body.toString('latin1').includes(stored));
});

test('csv export never includes contact, salary, or account fields', async () => {
  const res = await download(`${EXPORT_ENDPOINT}?format=csv&date=${LATEST_DAY}`);
  for (const value of ['private.person@example.test', '+92 300 0000000', '250000', 'reset-token-hash']) {
    assert.ok(!res.text.includes(value), `${value} leaked into the CSV`);
  }
});

test('csv export of a day with no records is a header-only CSV, not an error', async () => {
  const res = await download(`${EXPORT_ENDPOINT}?format=csv&date=${EMPTY_DAY}`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-disposition'), `attachment; filename="attendance-report-${EMPTY_DAY}.csv"`);
  assert.equal(res.text, BOM + CSV_HEADER);
});

test('csv export neutralizes spreadsheet formulas and quotes special characters', async () => {
  const mallory = addEmployee(50, '=HYPERLINK("http://evil.test")', '@SUM(A1:A9)');
  const comma = addEmployee(51, '+92', 'Khan, Imran');
  records = [
    attendance(60, mallory, EMPTY_DAY, '09:00'),
    attendance(61, comma, EMPTY_DAY, '09:05'),
  ];

  const res = await download(`${EXPORT_ENDPOINT}?format=csv&date=${EMPTY_DAY}`);
  assert.equal(res.text, BOM + CSV_HEADER
    + `'@SUM(A1:A9),"'=HYPERLINK(""http://evil.test"")",2025-03-11,09:00 AM,,present,\n`
    + `"Khan, Imran",'+92,2025-03-11,09:05 AM,,present,\n`);
});

test('a database error before any data is sent returns a JSON 500', async () => {
  makeCursor = () => new Readable({
    objectMode: true,
    read() {
      this.destroy(new Error('connection lost'));
    },
  });
  const errors = captureErrors();
  try {
    const res = await download(`${EXPORT_ENDPOINT}?format=csv&date=${LATEST_DAY}`);
    assert.equal(res.status, 500);
    assert.match(res.headers.get('content-type'), /^application\/json/);
    assert.equal(res.headers.get('content-disposition'), null);
    assert.deepEqual(JSON.parse(res.text), { success: false, message: 'Failed to export attendance.' });
    assert.equal(errors.logged.length, 1);
  } finally {
    errors.restore();
  }
});

test('a database error mid-stream aborts the download, is logged, and leaves the server running', async () => {
  let cursor;
  makeCursor = (docs) => (cursor = Readable.from((async function* () {
    yield docs[0];
    await new Promise((resolve) => setTimeout(resolve, 20));
    throw new Error('cursor died');
  })()));
  const errors = captureErrors();
  try {
    await assert.rejects(async () => {
      const response = await fetch(`${baseUrl}${EXPORT_ENDPOINT}?format=csv&date=${LATEST_DAY}`, {
        headers: { Authorization: `Bearer ${hrToken}` },
      });
      assert.equal(response.status, 200);
      await response.text();
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(cursor.destroyed, true);
    assert.equal(errors.logged.length, 1);
    assert.equal(errors.logged[0][1].message, 'cursor died');
  } finally {
    errors.restore();
  }

  makeCursor = defaultCursor;
  const res = await download(`${EXPORT_ENDPOINT}?format=csv&date=${LATEST_DAY}`);
  assert.equal(res.status, 200);
});

test('a client disconnect mid-download closes the cursor without logging an error', async () => {
  let cursor;
  // An endless cursor: only the disconnect can stop it.
  makeCursor = (docs) => (cursor = Readable.from((function* () {
    for (;;) yield docs[0];
  })()));
  const errors = captureErrors();
  try {
    const abort = new AbortController();
    const response = await fetch(`${baseUrl}${EXPORT_ENDPOINT}?format=csv&date=${LATEST_DAY}`, {
      headers: { Authorization: `Bearer ${hrToken}` },
      signal: abort.signal,
    });
    const reader = response.body.getReader();
    await reader.read();
    abort.abort();

    if (!cursor.destroyed) await once(cursor, 'close');
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(cursor.destroyed, true);
    assert.deepEqual(errors.logged, []);
  } finally {
    errors.restore();
  }
});

// --- Export: PDF streaming ---

// The text drawn on each page, one string per PDFKit text run: each page's content stream is
// inflated and the hex glyph strings of every TJ operator joined (standard fonts are WinAnsi).
// Streams are sliced by their declared /Length; a delimiter regex would cut off a compressed
// body that happens to end in \r.
const pdfPages = (buffer) =>
  [...buffer.toString('latin1').matchAll(/\/Length (\d+)[^>]*>>\s*stream\n/g)]
    .map((m) => {
      const start = m.index + m[0].length;
      return zlib.inflateSync(buffer.subarray(start, start + Number(m[1]))).toString('latin1');
    })
    .map((content) => [...content.matchAll(/\[([^\]]*)\] TJ/g)]
      .map(([, parts]) => [...parts.matchAll(/<([0-9a-f]*)>/gi)]
        .map(([, hex]) => Buffer.from(hex, 'hex').toString('latin1'))
        .join('')));

const downloadPdf = async (path, token = hrToken) => {
  const response = await fetch(`${baseUrl}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  return { status: response.status, headers: response.headers, body: Buffer.from(await response.arrayBuffer()) };
};

const PDF_TABLE_HEADER = ['Employee Name', 'Employee ID', 'Date', 'Check In', 'Check Out', 'Status', 'Working Hours'];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('pdf export draws the title, table header, and every record of the day in list order', async () => {
  for (const role of ['hr', 'admin']) {
    const res = await downloadPdf(`${EXPORT_ENDPOINT}?format=pdf&date=${LATEST_DAY}`, tokenFor(role));
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'application/pdf');
    assert.equal(res.headers.get('content-disposition'), `attachment; filename="attendance-report-${LATEST_DAY}.pdf"`);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.equal(res.body.subarray(0, 5).toString('latin1'), '%PDF-');
    assert.match(res.body.subarray(-8).toString('latin1'), /%%EOF\s*$/);

    // Empty cells draw no text, so the absent row shows only its date and status.
    assert.deepEqual(pdfPages(res.body), [[
      `Attendance Report - ${LATEST_DAY}`,
      'Times shown in Asia/Karachi',
      ...PDF_TABLE_HEADER,
      LATEST_DAY, 'absent',
      'Ayesha Khan', 'EMP-1001', LATEST_DAY, '08:45 AM', '05:05 PM', 'present', '8h 20m',
      'Bilal Ahmed', 'EMP-1002', LATEST_DAY, '08:50 AM', 'half-day',
      'Sara Malik', 'EMP-1003', LATEST_DAY, '08:50 AM', 'present',
      'Usman Ali', 'EMP-1004', LATEST_DAY, '09:15 AM', 'late',
      'Total records: 5',
    ]]);
  }
});

test('pdf export of a day with no records says so instead of drawing an empty table', async () => {
  const res = await downloadPdf(`${EXPORT_ENDPOINT}?format=pdf&date=${EMPTY_DAY}`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-disposition'), `attachment; filename="attendance-report-${EMPTY_DAY}.pdf"`);
  assert.deepEqual(pdfPages(res.body), [[
    `Attendance Report - ${EMPTY_DAY}`,
    'Times shown in Asia/Karachi',
    'No records found for this date',
  ]]);
});

test('pdf export breaks long days across pages and repeats the table header on each page', async () => {
  records = Array.from({ length: 60 }, (_, i) => {
    const worker = addEmployee(200 + i, `EMP-3${String(i).padStart(3, '0')}`, `Worker ${String(i).padStart(2, '0')}`);
    return attendance(200 + i, worker, EMPTY_DAY, DateTime.fromObject({ hour: 8 }).plus({ minutes: i }).toFormat('HH:mm'));
  });

  const pages = pdfPages((await downloadPdf(`${EXPORT_ENDPOINT}?format=pdf&date=${EMPTY_DAY}`)).body);
  assert.equal(pages.length, 3);
  pages.forEach((page, index) => {
    const header = index === 0 ? page.slice(2, 9) : page.slice(0, 7);
    assert.deepEqual(header, PDF_TABLE_HEADER, `page ${index + 1} must start its table with the header`);
    assert.equal(page.filter((text) => text === 'Employee Name').length, 1);
  });

  // Every record exactly once, in clock-in order, including the first batch the cursor buffered.
  const names = pages.flat().filter((text) => /^Worker \d+$/.test(text));
  assert.deepEqual(names, records.map((_, i) => `Worker ${String(i).padStart(2, '0')}`));
  assert.equal(pages.at(-1).at(-1), 'Total records: 60');
});

test('pdf export reads the same lean cursor query as the csv export', async () => {
  await download(`${EXPORT_ENDPOINT}?format=csv&date=${LATEST_DAY}`);
  const [csvFind] = queries;
  queries = [];

  await downloadPdf(`${EXPORT_ENDPOINT}?format=pdf&date=${LATEST_DAY}&page=2&limit=1`);
  assert.deepEqual(queries.map((q) => q.op), ['find'], 'no count or array-loading query');
  assert.deepEqual(queries[0].filter, csvFind.filter);
  assert.deepEqual(queries[0].state, csvFind.state);
});

test('pdf export answers a database error before any data with a JSON 500', async () => {
  makeCursor = () => new Readable({
    objectMode: true,
    read() {
      this.destroy(new Error('connection lost'));
    },
  });
  const errors = captureErrors();
  try {
    const res = await download(`${EXPORT_ENDPOINT}?format=pdf&date=${LATEST_DAY}`);
    assert.equal(res.status, 500);
    assert.equal(res.headers.get('content-disposition'), null);
    assert.deepEqual(JSON.parse(res.text), { success: false, message: 'Failed to export attendance.' });
    assert.equal(errors.logged.length, 1);
  } finally {
    errors.restore();
  }
});

test('pdf export aborts the download on a mid-stream database error, logs it, and keeps the server running', async () => {
  let cursor;
  makeCursor = (docs) => (cursor = Readable.from((async function* () {
    yield docs[0];
    await sleep(20);
    throw new Error('cursor died');
  })()));
  const errors = captureErrors();
  try {
    await assert.rejects(async () => {
      const response = await fetch(`${baseUrl}${EXPORT_ENDPOINT}?format=pdf&date=${LATEST_DAY}`, {
        headers: { Authorization: `Bearer ${hrToken}` },
      });
      assert.equal(response.status, 200);
      await response.arrayBuffer();
    });
    await sleep(20);
    assert.equal(cursor.destroyed, true);
    assert.equal(errors.logged.length, 1);
    assert.equal(errors.logged[0][1].message, 'cursor died');
  } finally {
    errors.restore();
  }

  makeCursor = defaultCursor;
  assert.equal((await downloadPdf(`${EXPORT_ENDPOINT}?format=pdf&date=${LATEST_DAY}`)).status, 200);
});

test('pdf export stops reading the cursor while the client is not reading, and closes it on disconnect', async () => {
  let cursor;
  let pulled = 0;
  // An endless cursor: only backpressure can pause it and only the disconnect can stop it.
  makeCursor = (docs) => (cursor = Readable.from((function* () {
    for (;;) {
      pulled += 1;
      yield docs[0];
    }
  })()));
  const errors = captureErrors();
  try {
    const abort = new AbortController();
    // The body is never read, so the socket fills up and the response needs to drain.
    await fetch(`${baseUrl}${EXPORT_ENDPOINT}?format=pdf&date=${LATEST_DAY}`, {
      headers: { Authorization: `Bearer ${hrToken}` },
      signal: abort.signal,
    });

    let previous = -1;
    for (let i = 0; i < 50 && pulled !== previous; i += 1) {
      previous = pulled;
      await sleep(200);
    }
    assert.equal(pulled, previous, 'the cursor kept being read while the client was not reading');

    abort.abort();
    if (!cursor.destroyed) await once(cursor, 'close');
    await sleep(20);
    assert.equal(cursor.destroyed, true);
    assert.deepEqual(errors.logged, []);
  } finally {
    errors.restore();
  }
});

test('the existing /api/attendance admin query keeps its access rules', async () => {
  const res = await get('/api/attendance?limit=200', tokenFor('admin'));
  // admin still passes authorization there; the 400 comes from that endpoint's own limit rule
  assert.equal(res.status, 400);
  assert.equal(res.body.message, 'limit must be an integer between 1 and 100');
});
