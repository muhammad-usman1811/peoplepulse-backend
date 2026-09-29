const test = require('node:test');
const assert = require('node:assert/strict');
const User = require('./src/models/User');
const employeeController = require('./src/controllers/employeeController');
const profileController = require('./src/controllers/profileController');

const originalMethods = {
  countDocuments: User.countDocuments,
  exists: User.exists,
  findOne: User.findOne,
  findByIdAndUpdate: User.findByIdAndUpdate,
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
  User.findByIdAndUpdate = originalMethods.findByIdAndUpdate;
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