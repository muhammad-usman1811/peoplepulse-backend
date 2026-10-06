const test = require('node:test');
const assert = require('node:assert/strict');
const User = require('./src/models/User');
const Candidate = require('./src/models/Candidate');
const Onboarding = require('./src/models/Onboarding');
const Document = require('./src/models/Document');
const Notification = require('./src/models/Notification');
const Department = require('./src/models/Department');
const Designation = require('./src/models/Designation');
const Location = require('./src/models/Location');
const employeeController = require('./src/controllers/employeeController');
const profileController = require('./src/controllers/profileController');

const originalMethods = {
  countDocuments: User.countDocuments,
  exists: User.exists,
  findOne: User.findOne,
  create: User.create,
  findById: User.findById,
  findByIdAndUpdate: User.findByIdAndUpdate,
  candidateFind: Candidate.find,
  candidateFindOne: Candidate.findOne,
  onboardingUpdateMany: Onboarding.updateMany,
  onboardingFindOne: Onboarding.findOne,
  documentUpdateMany: Document.updateMany,
  notificationCreate: Notification.create,
  departmentFindOne: Department.findOne,
  designationFindOne: Designation.findOne,
  locationFindOne: Location.findOne,
};

const runController = async (handler, req) => {
  const res = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  let nextError;
  await handler(req, res, (error) => { nextError = error; });
  if (nextError) throw nextError;
  return res;
};

test.afterEach(() => {
  User.countDocuments = originalMethods.countDocuments;
  User.exists = originalMethods.exists;
  User.findOne = originalMethods.findOne;
  User.create = originalMethods.create;
  User.findById = originalMethods.findById;
  User.findByIdAndUpdate = originalMethods.findByIdAndUpdate;
  Candidate.findOne = originalMethods.candidateFindOne;
  Candidate.find = originalMethods.candidateFind;
  Onboarding.updateMany = originalMethods.onboardingUpdateMany;
  Onboarding.findOne = originalMethods.onboardingFindOne;
  Document.updateMany = originalMethods.documentUpdateMany;
  Notification.create = originalMethods.notificationCreate;
  Department.findOne = originalMethods.departmentFindOne;
  Designation.findOne = originalMethods.designationFindOne;
  Location.findOne = originalMethods.locationFindOne;
});

test('employee list rejects malformed and out-of-range pagination before querying', async (t) => {
  for (const query of [
    { page: '1.5' },
    { page: '1abc' },
    { page: '0' },
    { limit: '101' },
    { limit: '0' },
  ]) {
    await t.test(JSON.stringify(query), async () => {
      User.countDocuments = () => { throw new Error('database must not be queried'); };
      const res = await runController(employeeController.listEmployees, { query });
      assert.equal(res.statusCode, 400);
    });
  }
});

test('employee creation rejects malformed phone numbers and IDs before querying', async (t) => {
  for (const body of [
    { phoneNumber: '123' },
    { phoneNumber: 923001234567 },
    { employeeId: 12345 },
  ]) {
    await t.test(JSON.stringify(body), async () => {
      User.exists = () => { throw new Error('database must not be queried'); };
      const res = await runController(employeeController.createEmployee, {
        body: {
          name: 'Test Employee',
          email: 'employee@example.test',
          password: 'Password123',
          ...body,
        },
        user: { _id: '64b000000000000000000001', role: 'hr' },
      });
      assert.equal(res.statusCode, 400);
    });
  }
});

test('employee creation links onboarding from a hired candidate, not another application', async () => {
  const employee = {
    _id: '64b000000000000000000010',
    name: 'Hired Candidate',
    email: 'employee@example.test',
    role: 'employee',
    employeeId: 'EMP-TEST',
    department: 'General',
    designation: 'Team Member',
    isActive: true,
  };
  const hiredCandidate = {
    _id: '64b000000000000000000020',
    onboarding: '64b000000000000000000030',
  };
  const otherHiredCandidate = { _id: '64b000000000000000000021', onboarding: hiredCandidate.onboarding };
  let candidateFilter;
  const onboardingUpdates = [];
  let documentUpdate;
  let welcomeNotification;

  User.exists = async () => false;
  Department.findOne = () => ({ select: () => ({ lean: async () => ({ name: 'General' }) }) });
  Designation.findOne = () => ({ select: () => ({ lean: async () => ({ name: 'Team Member' }) }) });
  User.create = async () => employee;
  User.findById = () => ({ populate: async () => employee });
  Candidate.find = (filter) => {
    candidateFilter = filter;
    return { sort: () => ({ select: async () => [hiredCandidate, otherHiredCandidate] }) };
  };
  Onboarding.updateMany = async (...args) => { onboardingUpdates.push(args); };
  Onboarding.findOne = async () => null;
  Document.updateMany = async (...args) => { documentUpdate = args; };
  Notification.create = async (notification) => { welcomeNotification = notification; };

  const originalNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'test';
  let res;
  try {
    res = await runController(employeeController.createEmployee, {
      body: {
        name: employee.name,
        email: employee.email,
        password: 'Password123',
        employeeId: employee.employeeId,
      },
      user: { _id: '64b000000000000000000001', role: 'hr' },
    });
  } finally {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  }

  assert.equal(res.statusCode, 201);
  assert.deepEqual(candidateFilter, {
    email: 'employee@example.test',
    stage: 'Hired',
    onboarding: { $exists: true, $ne: null },
  });
  assert.deepEqual(onboardingUpdates.at(-1), [
    { candidate: { $in: [hiredCandidate._id, otherHiredCandidate._id] } },
    { $set: { employee: employee._id } },
  ]);
  assert.deepEqual(documentUpdate, [
    { candidate: { $in: [hiredCandidate._id, otherHiredCandidate._id] } },
    { $set: { employee: employee._id, onboarding: hiredCandidate.onboarding } },
  ]);
  assert.match(welcomeNotification.body, /No onboarding checklist is linked yet/);
});

test('employee update rejects empty and invalid field changes before querying', async (t) => {
  for (const body of [{}, { role: 'admin' }, { phoneNumber: '123' }, { employeeId: 42 }]) {
    await t.test(JSON.stringify(body), async () => {
      User.findOne = () => { throw new Error('database must not be queried'); };
      const res = await runController(employeeController.updateEmployee, {
        params: { id: '64b000000000000000000001' },
        body,
        user: { _id: '64b000000000000000000002', role: 'hr' },
      });
      assert.equal(res.statusCode, 400);
    });
  }
});

test('profile update rejects malformed phone numbers before querying', async () => {
  User.findByIdAndUpdate = () => { throw new Error('database must not be queried'); };
  const res = await runController(profileController.updateProfile, {
    body: { phoneNumber: '123' },
    user: { _id: '64b000000000000000000001', role: 'employee' },
  });
  assert.equal(res.statusCode, 400);
});

test('valid international phone formats are accepted by shared validation', () => {
  const { isValidPhoneNumber } = require('./src/utils/phoneValidation');
  assert.equal(isValidPhoneNumber('+92 300 1234567'), true);
  assert.equal(isValidPhoneNumber('0300-1234567'), true);
  assert.equal(isValidPhoneNumber('123'), false);
});