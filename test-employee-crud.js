require('dotenv').config();
const assert = require('assert');
const mongoose = require('mongoose');
const dns = require('dns');
const User = require('./src/models/User');

dns.setServers((process.env.DNS_SERVERS || '8.8.8.8,1.1.1.1').split(','));

const baseUrl = `${process.env.BASE_URL || 'http://localhost:5000'}/api`;
const suffix = Date.now();

const request = async (path, options = {}) => {
  const response = await fetch(`${baseUrl}${path}`, options);
  return { status: response.status, data: await response.json() };
};

const login = async (email) => {
  const result = await request('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'Password@123' }),
  });
  assert.strictEqual(result.status, 200, `Login failed for ${email}`);
  return result.data.data.token;
};

(async () => {
  const createdIds = [];
  await mongoose.connect(process.env.MONGO_URI);

  try {
    const hr = await User.create({
      name: 'Temporary HR Test',
      email: `temporary.hr.${suffix}@peoplepulse.com`,
      password: 'Password@123',
      role: 'hr',
      employeeId: `TEST-HR-${suffix}`,
      department: 'Human Resources',
    });
    const employee = await User.create({
      name: 'Temporary Employee Test',
      email: `temporary.employee.${suffix}@peoplepulse.com`,
      password: 'Password@123',
      role: 'employee',
      employeeId: `TEST-EMP-${suffix}`,
      department: 'Engineering',
    });
    createdIds.push(hr._id, employee._id);

    const hrToken = await login(hr.email);
    const employeeToken = await login(employee.email);
    const hrHeaders = { Authorization: `Bearer ${hrToken}`, 'Content-Type': 'application/json' };
    const employeeHeaders = { Authorization: `Bearer ${employeeToken}`, 'Content-Type': 'application/json' };

    const created = await request('/employees', {
      method: 'POST',
      headers: hrHeaders,
      body: JSON.stringify({
        name: 'CRUD Permission Target',
        email: `crud.target.${suffix}@peoplepulse.com`,
        password: 'Password@123',
        department: 'Engineering',
        location: 'Head Office',
        status: 'on-leave',
      }),
    });
    assert.strictEqual(created.status, 201, 'HR should create employees');
    const targetId = created.data.data.employee.id;
    createdIds.push(targetId);

    const filtered = await request('/employees?department=Engineering&location=Head%20Office&status=on-leave', {
      headers: hrHeaders,
    });
    assert.strictEqual(filtered.status, 200, 'Employee filters should return 200');
    assert(filtered.data.data.employees.some((item) => String(item.id) === String(targetId)), 'Filters should find the target employee');

    const blockedCreate = await request('/employees', {
      method: 'POST',
      headers: employeeHeaders,
      body: JSON.stringify({ name: 'Blocked', email: `blocked.${suffix}@peoplepulse.com`, password: 'Password@123' }),
    });
    assert.strictEqual(blockedCreate.status, 403, 'Normal employee must be blocked from creating employees');

    const blockedDeactivate = await request(`/employees/${targetId}`, {
      method: 'DELETE',
      headers: employeeHeaders,
    });
    assert.strictEqual(blockedDeactivate.status, 403, 'Normal employee must be blocked from deactivating employees');

    const deactivated = await request(`/employees/${targetId}`, { method: 'DELETE', headers: hrHeaders });
    assert.strictEqual(deactivated.status, 200, 'HR should deactivate employees');
    console.log('Employee CRUD integration tests passed: filters, HR create/deactivate, employee create/deactivate blocks.');
  } finally {
    await User.deleteMany({ _id: { $in: createdIds } });
    await mongoose.disconnect();
  }
})().catch((error) => {
  console.error(`Employee CRUD integration test failed: ${error.message}`);
  process.exit(1);
});
