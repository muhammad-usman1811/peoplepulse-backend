require('dotenv').config();

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const mongoose = require('mongoose');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ||= crypto.randomBytes(32).toString('base64url');
process.env.ENCRYPTION_KEY ||= crypto.randomBytes(32).toString('hex');
process.env.MONGO_TEST_URI ||= 'mongodb://127.0.0.1:27017/peoplepulse_documents_audit_test';
process.env.MONGO_URI = require('./src/utils/testDatabase').getTestMongoUri();

const app = require('./src/server');
const User = require('./src/models/User');
const EmployeeDocument = require('./src/models/EmployeeDocument');
const SystemConfig = require('./src/models/SystemConfig');
const AuditLog = require('./src/models/AuditLog');

const request = async (baseUrl, path, token, method = 'GET', body) => {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, data: await response.json() };
};

const login = async (baseUrl, user, password) => {
  const result = await request(baseUrl, '/api/auth/login', null, 'POST', {
    email: user.email,
    password,
  });
  assert.equal(result.status, 200, `Expected ${user.role} login to succeed`);
  return result.data.data.token;
};

test('Documents, Audit Log, and System Config HTTP APIs enforce permissions and persist audited changes', {
  timeout: 90000,
}, async () => {
  await mongoose.connection.asPromise();
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, () => resolve(listener));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const suffix = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const password = 'IntegrationPass123';
  const users = [];
  const documents = [];
  const configs = [];
  const auditIds = [];

  try {
    const [superAdmin, admin, hr, employee, otherEmployee] = await User.create([
      { name: 'Documents API Super Admin', email: `docs.superadmin.${suffix}@example.test`, password, role: 'superadmin' },
      { name: 'Documents API Admin', email: `docs.admin.${suffix}@example.test`, password, role: 'admin' },
      { name: 'Documents API HR', email: `docs.hr.${suffix}@example.test`, password, role: 'hr' },
      { name: 'Documents API Employee', email: `docs.employee.${suffix}@example.test`, password, role: 'employee' },
      { name: 'Documents API Other Employee', email: `docs.other.${suffix}@example.test`, password, role: 'employee' },
    ]);
    users.push(superAdmin, admin, hr, employee, otherEmployee);

    const tokens = {
      superadmin: await login(baseUrl, superAdmin, password),
      admin: await login(baseUrl, admin, password),
      hr: await login(baseUrl, hr, password),
      employee: await login(baseUrl, employee, password),
      otherEmployee: await login(baseUrl, otherEmployee, password),
    };

    const documentRecords = await EmployeeDocument.create([
      { userId: employee._id, category: 'certificate', originalName: `employee-${suffix}.pdf`, mimeType: 'application/pdf', size: 10, fileData: Buffer.from('%PDF-1.4\n') },
      { userId: employee._id, category: 'contract', originalName: `hr-delete-${suffix}.pdf`, mimeType: 'application/pdf', size: 10, fileData: Buffer.from('%PDF-1.4\n') },
      { userId: employee._id, category: 'contract', originalName: `admin-delete-${suffix}.pdf`, mimeType: 'application/pdf', size: 10, fileData: Buffer.from('%PDF-1.4\n') },
      { userId: employee._id, category: 'contract', originalName: `superadmin-delete-${suffix}.pdf`, mimeType: 'application/pdf', size: 10, fileData: Buffer.from('%PDF-1.4\n') },
      { userId: otherEmployee._id, category: 'certificate', originalName: `other-${suffix}.pdf`, mimeType: 'application/pdf', size: 10, fileData: Buffer.from('%PDF-1.4\n') },
    ]);
    documents.push(...documentRecords);

    const unauthenticatedDocuments = await request(baseUrl, '/api/employee-documents/me');
    assert.equal(unauthenticatedDocuments.status, 401);
    const ownDocuments = await request(baseUrl, '/api/employee-documents/me', tokens.employee);
    assert.equal(ownDocuments.status, 200);
    assert.equal(ownDocuments.data.data.documents.length, 4);
    assert.ok(ownDocuments.data.data.documents.every((item) => item.fileData === undefined));

    const forbiddenEmployeeList = await request(
      baseUrl,
      `/api/employee-documents/employee/${otherEmployee._id}`,
      tokens.employee
    );
    assert.equal(forbiddenEmployeeList.status, 403);
    for (const role of ['hr', 'admin', 'superadmin']) {
      const employeeList = await request(
        baseUrl,
        `/api/employee-documents/employee/${employee._id}`,
        tokens[role]
      );
      assert.equal(employeeList.status, 200, `${role} should list employee documents`);
      assert.equal(employeeList.data.data.documents.length, 4);
      assert.ok(employeeList.data.data.documents.every((item) => item.fileData === undefined));
    }
    assert.equal((await request(baseUrl, `/api/employee-documents/employee/${employee._id}`)).status, 401);
    assert.equal((await request(baseUrl, '/api/employee-documents/employee/not-an-id', tokens.hr)).status, 400);
    assert.equal((await request(baseUrl, `/api/employee-documents/employee/${superAdmin._id}`, tokens.hr)).status, 404);

    const employeeDeleteOther = await request(
      baseUrl,
      `/api/employee-documents/${documentRecords[4]._id}`,
      tokens.employee,
      'DELETE'
    );
    assert.equal(employeeDeleteOther.status, 404);
    const employeeDeleteOwn = await request(
      baseUrl,
      `/api/employee-documents/${documentRecords[0]._id}`,
      tokens.employee,
      'DELETE'
    );
    assert.equal(employeeDeleteOwn.status, 200);
    documents.splice(documents.indexOf(documentRecords[0]), 1);
    for (const [role, record] of [
      ['hr', documentRecords[1]],
      ['admin', documentRecords[2]],
      ['superadmin', documentRecords[3]],
    ]) {
      const deletion = await request(baseUrl, `/api/employee-documents/${record._id}`, tokens[role], 'DELETE');
      assert.equal(deletion.status, 200, `${role} should delete employee documents`);
      documents.splice(documents.indexOf(record), 1);
    }
    assert.equal((await request(baseUrl, `/api/employee-documents/${documentRecords[1]._id}`, tokens.hr, 'DELETE')).status, 404);
    assert.equal((await request(baseUrl, `/api/employee-documents/${new mongoose.Types.ObjectId()}`, tokens.hr, 'DELETE')).status, 404);
    assert.equal((await request(baseUrl, `/api/employee-documents/${documentRecords[4]._id}`, null, 'DELETE')).status, 401);

    const unauthenticatedAudit = await request(baseUrl, '/api/audit-logs');
    assert.equal(unauthenticatedAudit.status, 401);
    for (const role of ['admin', 'hr', 'employee']) {
      const denied = await request(baseUrl, '/api/audit-logs', tokens[role]);
      assert.equal(denied.status, 403, `${role} must not read audit logs`);
    }
    assert.equal((await request(baseUrl, '/api/audit-logs', tokens.superadmin)).status, 200);

    const entityType = `IntegrationFilter-${suffix}`;
    const seededLogs = await AuditLog.create([
      { actor: superAdmin._id, actorName: superAdmin.name, actorRole: superAdmin.role, action: 'CREATE', resource: entityType, resourceId: `a-${suffix}`, createdAt: new Date('2026-10-05T12:00:00.000Z') },
      { actor: superAdmin._id, actorName: superAdmin.name, actorRole: superAdmin.role, action: 'UPDATE', resource: entityType, resourceId: `b-${suffix}`, createdAt: new Date('2026-10-15T12:00:00.000Z') },
      { actor: admin._id, actorName: admin.name, actorRole: admin.role, action: 'CREATE', resource: entityType, resourceId: `c-${suffix}`, createdAt: new Date('2026-10-20T12:00:00.000Z') },
      { actor: superAdmin._id, actorName: superAdmin.name, actorRole: superAdmin.role, action: 'DELETE', resource: entityType, resourceId: `d-${suffix}`, createdAt: new Date('2026-11-01T00:00:00.000Z') },
      { actor: superAdmin._id, actorName: superAdmin.name, actorRole: superAdmin.role, action: 'CREATE', resource: `Other-${suffix}`, resourceId: `e-${suffix}`, createdAt: new Date('2026-10-10T12:00:00.000Z') },
    ]);
    auditIds.push(...seededLogs.map((log) => log._id));

    const entityLogs = await request(
      baseUrl,
      `/api/audit-logs?entityType=${encodeURIComponent(entityType)}`,
      tokens.superadmin
    );
    assert.equal(entityLogs.status, 200);
    assert.equal(entityLogs.data.data.pagination.total, 4);
    assert.ok(entityLogs.data.data.logs.every((log) => log.resource === entityType));

    const actorLogs = await request(
      baseUrl,
      `/api/audit-logs?actor=${superAdmin._id}`,
      tokens.superadmin
    );
    assert.equal(actorLogs.status, 200);
    assert.ok(actorLogs.data.data.logs.length > 0);
    assert.ok(actorLogs.data.data.logs.every((log) => String(log.actor) === String(superAdmin._id)));

    const fromLogs = await request(
      baseUrl,
      `/api/audit-logs?entityType=${encodeURIComponent(entityType)}&from=2026-10-15`,
      tokens.superadmin
    );
    assert.deepEqual(fromLogs.data.data.logs.map((log) => log.resourceId), [`d-${suffix}`, `c-${suffix}`, `b-${suffix}`]);
    assert.equal(fromLogs.data.data.pagination.total, 3);

    const toLogs = await request(
      baseUrl,
      `/api/audit-logs?entityType=${encodeURIComponent(entityType)}&to=2026-10-15`,
      tokens.superadmin
    );
    assert.equal(toLogs.data.data.pagination.total, 2);
    assert.ok(toLogs.data.data.logs.every((log) => new Date(log.createdAt) <= new Date('2026-10-15T23:59:59.999Z')));

    const combinedLogs = await request(
      baseUrl,
      `/api/audit-logs?entityType=${encodeURIComponent(entityType)}&actor=${superAdmin._id}&from=2026-10-01&to=2026-10-31`,
      tokens.superadmin
    );
    assert.equal(combinedLogs.status, 200);
    assert.equal(combinedLogs.data.data.pagination.total, 2);
    assert.ok(combinedLogs.data.data.logs.every((log) => (
      log.resource === entityType && String(log.actor) === String(superAdmin._id)
    )));

    const pageOne = await request(
      baseUrl,
      `/api/audit-logs?entityType=${encodeURIComponent(entityType)}&page=1&limit=2`,
      tokens.superadmin
    );
    assert.equal(pageOne.status, 200);
    assert.equal(pageOne.data.data.logs.length, 2);
    assert.equal(pageOne.data.data.pagination.page, 1);
    assert.equal(pageOne.data.data.pagination.totalPages, 2);
    const pageTwo = await request(
      baseUrl,
      `/api/audit-logs?entityType=${encodeURIComponent(entityType)}&page=2&limit=2`,
      tokens.superadmin
    );
    assert.equal(pageTwo.data.data.logs.length, 2);
    assert.notEqual(pageOne.data.data.logs[0]._id, pageTwo.data.data.logs[0]._id);
    assert.equal((await request(baseUrl, '/api/audit-logs?page=0', tokens.superadmin)).status, 400);
    assert.equal((await request(baseUrl, '/api/audit-logs?actor=invalid', tokens.superadmin)).status, 400);
    assert.equal((await request(baseUrl, '/api/audit-logs?from=2026-02-30', tokens.superadmin)).status, 400);
    assert.equal((await request(baseUrl, '/api/audit-logs?from=2026-11-01&to=2026-10-01', tokens.superadmin)).status, 400);

    assert.equal((await request(baseUrl, '/api/system-config')).status, 401);
    for (const role of ['superadmin', 'admin', 'hr', 'employee']) {
      const configList = await request(baseUrl, '/api/system-config', tokens[role]);
      assert.equal(configList.status, 200, `${role} should read system configuration`);
      assert.ok(Array.isArray(configList.data.data.settings));
    }
    for (const role of ['admin', 'hr', 'employee']) {
      const denied = await request(
        baseUrl,
        '/api/system-config',
        tokens[role],
        'PUT',
        { key: `integration.${suffix}.${role}`, value: 1 }
      );
      assert.equal(denied.status, 403, `${role} must not write system configuration`);
    }
    assert.equal((await request(baseUrl, '/api/system-config', null, 'PUT', { key: `integration.${suffix}.unauth`, value: 1 })).status, 401);
    assert.equal((await request(baseUrl, '/api/system-config', tokens.superadmin, 'PUT', { value: 1 })).status, 400);
    assert.equal((await request(baseUrl, '/api/system-config', tokens.superadmin, 'PUT', { key: '1invalid', value: 1 })).status, 400);
    assert.equal((await request(baseUrl, '/api/system-config', tokens.superadmin, 'PUT', { key: `integration.${suffix}.missing` })).status, 400);

    const settingKey = `integration.${suffix}.auditedValue`;
    configs.push(settingKey);
    const initialValue = { days: 17 };
    const updatedValue = { days: 23 };
    const createdSetting = await request(
      baseUrl,
      '/api/system-config',
      tokens.superadmin,
      'PUT',
      { key: settingKey, value: initialValue }
    );
    assert.equal(createdSetting.status, 200);
    assert.equal(createdSetting.data.data.setting.key, settingKey);
    assert.deepEqual(createdSetting.data.data.setting.value, initialValue);

    const updatedSetting = await request(
      baseUrl,
      '/api/system-config',
      tokens.superadmin,
      'PUT',
      { key: settingKey, value: updatedValue }
    );
    assert.equal(updatedSetting.status, 200);
    assert.deepEqual(updatedSetting.data.data.setting.value, updatedValue);

    const auditForConfig = await request(
      baseUrl,
      `/api/audit-logs?entityType=SystemConfig&resourceId=${encodeURIComponent(settingKey)}&actor=${superAdmin._id}&from=2020-01-01&to=2099-12-31`,
      tokens.superadmin
    );
    assert.equal(auditForConfig.status, 200);
    assert.equal(auditForConfig.data.data.pagination.total, 2);
    const updateAudit = auditForConfig.data.data.logs.find((log) => log.action === 'UPDATE');
    const createAudit = auditForConfig.data.data.logs.find((log) => log.action === 'CREATE');
    assert.ok(createAudit, 'config creation must persist its audit record');
    assert.ok(updateAudit, 'config update must persist its audit record');
    for (const log of [createAudit, updateAudit]) {
      assert.equal(String(log.actor), String(superAdmin._id));
      assert.equal(log.actorRole, 'superadmin');
      assert.equal(log.resource, 'SystemConfig');
      assert.equal(log.resourceId, settingKey);
    }
    assert.equal(createAudit.meta.before, null);
    assert.deepEqual(createAudit.meta.after, initialValue);
    assert.deepEqual(updateAudit.meta.before, initialValue);
    assert.deepEqual(updateAudit.meta.after, updatedValue);

    const configFromRead = await request(baseUrl, '/api/system-config', tokens.employee);
    const readSetting = configFromRead.data.data.settings.find((setting) => setting.key === settingKey);
    assert.deepEqual(readSetting.value, updatedValue);
  } finally {
    await Promise.all([
      EmployeeDocument.deleteMany({ userId: { $in: users.map((user) => user._id) } }),
      SystemConfig.deleteMany({ key: { $in: configs } }),
      AuditLog.deleteMany({ $or: [{ _id: { $in: auditIds } }, { actor: { $in: users.map((user) => user._id) } }] }),
      User.deleteMany({ _id: { $in: users.map((user) => user._id) } }),
    ]);
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    await mongoose.disconnect();
  }
});
