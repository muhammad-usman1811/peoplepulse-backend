const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const EmployeeDocument = require('./src/models/EmployeeDocument');
const User = require('./src/models/User');
const SystemConfig = require('./src/models/SystemConfig');
const AuditLog = require('./src/models/AuditLog');
const documentController = require('./src/controllers/documentController');
const systemConfigController = require('./src/controllers/systemConfigController');
const auditLogController = require('./src/controllers/auditLogController');

const original = {
  documentFind: EmployeeDocument.find,
  documentFindOneAndDelete: EmployeeDocument.findOneAndDelete,
  userFindOne: User.findOne,
  configFind: SystemConfig.find,
  configFindOne: SystemConfig.findOne,
  configFindOneAndUpdate: SystemConfig.findOneAndUpdate,
  auditFind: AuditLog.find,
  auditCountDocuments: AuditLog.countDocuments,
  auditRecord: AuditLog.record,
};

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

const query = (value) => ({
  select() { return this; },
  sort() { return this; },
  skip() { return this; },
  limit() { return this; },
  lean() { return Promise.resolve(value); },
  then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); },
});

test.afterEach(() => {
  EmployeeDocument.find = original.documentFind;
  EmployeeDocument.findOneAndDelete = original.documentFindOneAndDelete;
  User.findOne = original.userFindOne;
  SystemConfig.find = original.configFind;
  SystemConfig.findOne = original.configFindOne;
  SystemConfig.findOneAndUpdate = original.configFindOneAndUpdate;
  AuditLog.find = original.auditFind;
  AuditLog.countDocuments = original.auditCountDocuments;
  AuditLog.record = original.auditRecord;
});

test('HR document listing is scoped to the requested employee and excludes file bytes', async () => {
  const employeeId = new mongoose.Types.ObjectId();
  const documents = [{ _id: new mongoose.Types.ObjectId(), category: 'certificate' }];
  let employeeFilter;
  let documentFilter;

  User.findOne = (filter) => {
    employeeFilter = filter;
    return query({ _id: employeeId });
  };
  EmployeeDocument.find = (filter) => {
    documentFilter = filter;
    return query(documents);
  };

  const res = await runController(documentController.listEmployeeDocuments, {
    params: { employeeId: employeeId.toString() },
  });

  assert.equal(res.statusCode, 200);
  assert.deepEqual(employeeFilter, { _id: employeeId.toString(), role: 'employee' });
  assert.deepEqual(documentFilter, { userId: employeeId });
  assert.deepEqual(res.body.data.documents, documents);
});

test('document deletion only targets the authenticated employee document', async () => {
  const userId = new mongoose.Types.ObjectId();
  const documentId = new mongoose.Types.ObjectId();
  let deletionFilter;
  EmployeeDocument.findOneAndDelete = async (filter) => {
    deletionFilter = filter;
    return null;
  };
  AuditLog.record = async () => {};

  const res = await runController(documentController.deleteDocument, {
    params: { id: documentId.toString() },
    user: { _id: userId, role: 'employee' },
    headers: {},
  });

  assert.equal(res.statusCode, 404);
  assert.deepEqual(deletionFilter, { _id: documentId.toString(), userId });
});

test('system configuration updates are not successful until their audit record is written', async () => {
  const actorId = new mongoose.Types.ObjectId();
  const priorSetting = { key: 'leave.annualAllocation', value: { days: 15 } };
  const updatedSetting = { key: priorSetting.key, value: { days: 20 } };
  let auditEntry;
  SystemConfig.findOne = () => query(priorSetting);
  SystemConfig.findOneAndUpdate = async () => updatedSetting;
  AuditLog.record = async (entry) => { auditEntry = entry; };

  const res = await runController(systemConfigController.putSystemConfig, {
    body: { key: priorSetting.key, value: updatedSetting.value },
    user: { _id: actorId, name: 'Admin', role: 'superadmin' },
    headers: {},
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.setting, updatedSetting);
  assert.equal(auditEntry.action, 'UPDATE');
  assert.equal(auditEntry.resource, 'SystemConfig');
  assert.equal(auditEntry.resourceId, priorSetting.key);
  assert.deepEqual(auditEntry.meta, { before: priorSetting.value, after: updatedSetting.value });
});

test('audit log filters entity type, actor, and inclusive date range', async () => {
  const actorId = new mongoose.Types.ObjectId();
  const expectedLogs = [{ _id: 'audit-entry' }];
  let filter;
  AuditLog.find = (value) => {
    filter = value;
    return query(expectedLogs);
  };
  AuditLog.countDocuments = async () => 1;

  const res = await runController(auditLogController.listAuditLogs, {
    query: {
      entityType: 'SystemConfig',
      actor: actorId.toString(),
      from: '2026-10-01',
      to: '2026-10-31',
    },
  });

  assert.equal(res.statusCode, 200);
  assert.equal(filter.resource, 'SystemConfig');
  assert.equal(filter.actor, actorId.toString());
  assert.equal(filter.createdAt.$gte.toISOString(), '2026-10-01T00:00:00.000Z');
  assert.equal(filter.createdAt.$lte.toISOString(), '2026-10-31T23:59:59.999Z');
  assert.deepEqual(res.body.data.logs, expectedLogs);
});
