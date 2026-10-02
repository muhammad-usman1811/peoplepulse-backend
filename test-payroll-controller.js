const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const User = require('./src/models/User');
const SalaryStructure = require('./src/models/SalaryStructure');
const Payslip = require('./src/models/Payslip');
const Notification = require('./src/models/Notification');
const AuditLog = require('./src/models/AuditLog');
const controller = require('./src/controllers/payrollController');
const payrollRoutes = require('./src/routes/payrollRoutes');

const original = {
  userFind: User.find,
  structureFindById: SalaryStructure.findById,
  structureFindByIdAndUpdate: SalaryStructure.findByIdAndUpdate,
  payslipFind: Payslip.find,
  payslipCountDocuments: Payslip.countDocuments,
  payslipFindOne: Payslip.findOne,
  payslipInsertMany: Payslip.insertMany,
  payslipFindById: Payslip.findById,
  payslipFindOneAndUpdate: Payslip.findOneAndUpdate,
  auditRecord: AuditLog.record,
  notificationCreate: Notification.create,
  consoleError: console.error,
};

const ids = { actor: new mongoose.Types.ObjectId(), employee: new mongoose.Types.ObjectId(), structure: new mongoose.Types.ObjectId(), payslip: new mongoose.Types.ObjectId() };
const auditEntries = [];

const response = () => ({
  statusCode: 200,
  body: null,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});

const runController = async (handler, req) => {
  const res = response();
  let nextError;
  await handler(req, res, (error) => { nextError = error; });
  if (nextError) throw nextError;
  return res;
};

test.afterEach(() => {
  User.find = original.userFind;
  SalaryStructure.findById = original.structureFindById;
  SalaryStructure.findByIdAndUpdate = original.structureFindByIdAndUpdate;
  Payslip.find = original.payslipFind;
  Payslip.countDocuments = original.payslipCountDocuments;
  Payslip.findOne = original.payslipFindOne;
  Payslip.insertMany = original.payslipInsertMany;
  Payslip.findById = original.payslipFindById;
  Payslip.findOneAndUpdate = original.payslipFindOneAndUpdate;
  AuditLog.record = original.auditRecord;
  Notification.create = original.notificationCreate;
  console.error = original.consoleError;
  auditEntries.length = 0;
});

test('generates a payslip using the hand-checked basic and allowance math and audits it', async () => {
  const employee = {
    _id: ids.employee,
    monthlySalary: 100000,
    salaryStructure: {
      _id: ids.structure,
      grade: 'G7',
      basicPercentage: 60,
      allowances: [
        { name: 'Housing', type: 'percentage', value: 20 },
        { name: 'Transport', type: 'fixed', value: 5000 },
      ],
    },
  };
  let created;
  User.find = () => ({ populate: async () => [employee] });
  Payslip.find = () => ({ select: async () => [] });
  Payslip.insertMany = async (values) => {
    created = { ...values[0], _id: ids.payslip, status: 'pending' };
    return [created];
  };
  AuditLog.record = async (entry) => { auditEntries.push(entry); };

  const res = await runController(controller.generatePayslips, {
    body: { month: '2026-09' },
    user: { _id: ids.actor, name: 'Payroll HR', role: 'hr' },
    headers: {},
    ip: '127.0.0.1',
  });

  assert.equal(res.statusCode, 201);
  assert.equal(created.basicPay, 60000);
  assert.deepEqual(created.allowances.map(({ amount }) => amount), [12000, 5000]);
  assert.equal(created.grossPay, 77000);
  assert.equal(created.deductions, 0);
  assert.equal(created.netPay, 77000);
  assert.equal(res.body.data.count, 1);
  assert.equal(auditEntries.length, 1);
  assert.equal(auditEntries[0].resource, 'Payslip');
  assert.equal(auditEntries[0].action, 'CREATE');
});

test('finance approval records an approval audit entry', async () => {
  const payslip = { _id: ids.payslip, employee: ids.employee, month: '2026-09', status: 'pending' };
  let notification;
  Payslip.findById = async () => payslip;
  Payslip.findOneAndUpdate = async (_filter, update) => Object.assign(payslip, update.$set);
  AuditLog.record = async (entry) => { auditEntries.push(entry); };
  Notification.create = async (values) => {
    notification = new Notification(values);
    await notification.validate();
    return notification;
  };

  const res = await runController(controller.approvePayslip, {
    params: { id: String(ids.payslip) },
    body: {},
    user: { _id: ids.actor, name: 'Finance Reviewer', role: 'finance' },
    headers: {},
  });

  assert.equal(res.statusCode, 200);
  assert.equal(payslip.status, 'approved');
  assert.equal(auditEntries[0].action, 'APPROVE');
  assert.equal(auditEntries[0].resourceId, ids.payslip);
  assert.equal(String(notification.userId), String(ids.employee));
  assert.equal(notification.type, 'payslip_approved');
  assert.equal(notification.body, `Your payslip for ${payslip.month} has been approved.`);
});

test('payslip approval succeeds when notification delivery fails', async () => {
  const payslip = { _id: ids.payslip, employee: ids.employee, month: '2026-09', status: 'pending' };
  let logged = false;
  Payslip.findById = async () => payslip;
  Payslip.findOneAndUpdate = async (_filter, update) => Object.assign(payslip, update.$set);
  AuditLog.record = async () => {};
  Notification.create = async () => { throw new Error('notification database unavailable'); };
  console.error = () => { logged = true; };

  const res = await runController(controller.approvePayslip, {
    params: { id: String(ids.payslip) },
    body: {},
    user: { _id: ids.actor, name: 'Finance Reviewer', role: 'finance' },
    headers: {},
  });

  assert.equal(res.statusCode, 200);
  assert.equal(payslip.status, 'approved');
  assert.equal(logged, true);
});

test('sending a payslip back notifies the employee with the decision note', async () => {
  const payslip = { _id: ids.payslip, employee: ids.employee, month: '2026-09', status: 'pending' };
  let notification;
  Payslip.findById = async () => payslip;
  Payslip.findOneAndUpdate = async (_filter, update) => Object.assign(payslip, update.$set);
  AuditLog.record = async () => {};
  Notification.create = async (values) => { notification = values; return values; };

  const res = await runController(controller.sendBackPayslip, {
    params: { id: String(ids.payslip) },
    body: { note: 'Check the allowance.' },
    user: { _id: ids.actor, role: 'finance' },
    headers: {},
  });

  assert.equal(res.statusCode, 200);
  assert.equal(notification.type, 'payslip_sent_back');
  assert.match(notification.body, /Check the allowance\./);
});

test('finance send-back records a rejection audit entry and its note', async () => {
  const payslip = { _id: ids.payslip, employee: ids.employee, month: '2026-09', status: 'pending' };
  Payslip.findById = async () => payslip;
  Payslip.findOneAndUpdate = async (_filter, update) => Object.assign(payslip, update.$set);
  AuditLog.record = async (entry) => { auditEntries.push(entry); };
  Notification.create = async () => {};

  const res = await runController(controller.sendBackPayslip, {
    params: { id: String(ids.payslip) },
    body: { note: 'Please correct the housing allowance.' },
    user: { _id: ids.actor, name: 'Finance Reviewer', role: 'finance' },
    headers: {},
  });

  assert.equal(res.statusCode, 200);
  assert.equal(payslip.status, 'sent_back');
  assert.equal(auditEntries[0].action, 'REJECT');
  assert.equal(auditEntries[0].meta.note, 'Please correct the housing allowance.');
});

test('generation refuses to create a partial batch when an employee has no pay assignment', async () => {
  User.find = () => ({ populate: async () => [{ _id: ids.employee, monthlySalary: null, salaryStructure: null }] });

  const res = await runController(controller.generatePayslips, {
    body: { month: '2026-09' },
    user: { _id: ids.actor, name: 'Payroll HR', role: 'hr' },
    headers: {},
  });

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error.employeeIds[0], ids.employee);
});

test('payslip decision routes authorize finance and deny HR', async () => {
  const route = payrollRoutes.stack.find((layer) => layer.route?.path === '/payslips/:id/approve').route;
  const authorizeFinance = route.stack[0].handle;
  const financeResponse = response();
  let financeContinued = false;
  authorizeFinance({ user: { role: 'finance' } }, financeResponse, () => { financeContinued = true; });
  assert.equal(financeContinued, true);

  const hrResponse = response();
  let hrContinued = false;
  authorizeFinance({ user: { role: 'hr' } }, hrResponse, () => { hrContinued = true; });
  assert.equal(hrContinued, false);
  assert.equal(hrResponse.statusCode, 403);
});

test('payslip read routes allow finance, employees, and payroll managers', async () => {
  for (const path of ['/payslips', '/payslips/:id']) {
    const route = payrollRoutes.stack.find((layer) => layer.route?.path === path).route;
    const authorizeReaders = route.stack[0].handle;
    for (const role of ['finance', 'employee', 'hr', 'admin', 'superadmin']) {
      let continued = false;
      authorizeReaders({ user: { role } }, response(), () => { continued = true; });
      assert.equal(continued, true);
    }

  }
});

test('salary-structure updates write an audit entry', async () => {
  const existing = { _id: ids.structure, grade: 'G7', basicPercentage: 60, allowances: [] };
  SalaryStructure.findById = async () => existing;
  SalaryStructure.findByIdAndUpdate = async () => ({ ...existing, basicPercentage: 65 });
  AuditLog.record = async (entry) => { auditEntries.push(entry); };

  const res = await runController(controller.updateSalaryStructure, {
    params: { id: String(ids.structure) },
    body: { basicPercentage: 65 },
    user: { _id: ids.actor, name: 'Payroll HR', role: 'hr' },
    headers: {},
  });

  assert.equal(res.statusCode, 200);
  assert.equal(auditEntries.length, 1);
  assert.equal(auditEntries[0].action, 'UPDATE');
  assert.equal(auditEntries[0].resource, 'SalaryStructure');
});

test('generation inserts only missing employees after one month lookup', async () => {
  const existingEmployee = {
    _id: ids.employee,
    monthlySalary: 100000,
    salaryStructure: { _id: ids.structure, grade: 'G7', basicPercentage: 60, allowances: [] },
  };
  const missingEmployeeId = new mongoose.Types.ObjectId();
  const missingEmployee = { ...existingEmployee, _id: missingEmployeeId };
  let lookupCount = 0;
  let insertCount = 0;
  User.find = () => ({ populate: async () => [existingEmployee, missingEmployee] });
  Payslip.find = (filter) => {
    lookupCount += 1;
    assert.deepEqual(filter, { month: '2026-09' });
    return { select: async () => [{ employee: ids.employee }] };
  };
  Payslip.insertMany = async (values) => {
    insertCount += 1;
    assert.equal(values.length, 1);
    assert.equal(String(values[0].employee), String(missingEmployeeId));
    return [{ ...values[0], _id: ids.payslip, status: 'pending' }];
  };
  AuditLog.record = async (entry) => { auditEntries.push(entry); };

  const res = await runController(controller.generatePayslips, {
    body: { month: '2026-09' },
    user: { _id: ids.actor, name: 'Payroll HR', role: 'hr' },
    headers: {},
  });

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.data.count, 1);
  assert.equal(lookupCount, 1);
  assert.equal(insertCount, 1);
});

test('employee payslip list and detail are scoped to the authenticated employee', async () => {
  let listFilter;
  let detailFilter;
  const payslip = { _id: ids.payslip, employee: ids.employee, month: '2026-09' };
  Payslip.find = (filter) => {
    listFilter = filter;
    return {
      sort() { return this; },
      skip() { return this; },
      limit() { return this; },
      populate() { return Promise.resolve([payslip]); },
    };
  };
  Payslip.countDocuments = async (filter) => {
    assert.deepEqual(filter, listFilter);
    return 1;
  };
  Payslip.findOne = async (filter) => {
    detailFilter = filter;
    return payslip;
  };

  const req = { query: {}, params: { id: String(ids.payslip) }, user: { _id: ids.employee, role: 'employee' } };
  const listRes = await runController(controller.listPayslips, req);
  const detailRes = await runController(controller.getPayslip, req);

  assert.deepEqual(listFilter, { employee: ids.employee });
  assert.deepEqual(detailFilter, { _id: String(ids.payslip), employee: ids.employee });
  assert.equal(listRes.body.data.pagination.total, 1);
  assert.equal(detailRes.body.data.payslip, payslip);
});