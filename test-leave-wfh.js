require('dotenv').config();
const assert = require('assert');
const mongoose = require('mongoose');
const dns = require('dns');
const User = require('./src/models/User');
const LeaveRequest = require('./src/models/LeaveRequest');
const WfhRequest = require('./src/models/WfhRequest');

const baseUrl = `${process.env.BASE_URL || 'http://localhost:5000'}/api`;
const suffix = Date.now();

dns.setServers((process.env.DNS_SERVERS || '8.8.8.8,1.1.1.1').split(','));

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
  const createdUsers = [];
  const createdRequests = [];
  await mongoose.connect(process.env.MONGO_URI);

  try {
    const manager = await User.create({
      name: 'Leave WFH Test Manager',
      email: `leave.manager.${suffix}@peoplepulse.com`,
      password: 'Password@123',
      role: 'admin',
      employeeId: `TEST-MANAGER-${suffix}`,
    });
    const employee = await User.create({
      name: 'Leave WFH Test Employee',
      email: `leave.employee.${suffix}@peoplepulse.com`,
      password: 'Password@123',
      role: 'employee',
      employeeId: `TEST-REQUEST-${suffix}`,
      manager: manager._id,
    });
    createdUsers.push(manager._id, employee._id);

    const managerToken = await login(manager.email);
    const employeeToken = await login(employee.email);
    const employeeHeaders = { Authorization: `Bearer ${employeeToken}`, 'Content-Type': 'application/json' };
    const managerHeaders = { Authorization: `Bearer ${managerToken}`, 'Content-Type': 'application/json' };

    const leave = await request('/leave-requests', {
      method: 'POST',
      headers: employeeHeaders,
      body: JSON.stringify({ type: 'annual', startDate: '2026-10-05', endDate: '2026-10-07', reason: 'Family trip' }),
    });
    assert.strictEqual(leave.status, 201, 'Employee should apply for leave');
    const leaveId = leave.data.data.request.id;
    createdRequests.push(leaveId);

    const overlappingLeave = await request('/leave-requests', {
      method: 'POST',
      headers: employeeHeaders,
      body: JSON.stringify({ type: 'sick', startDate: '2026-10-06', endDate: '2026-10-06' }),
    });
    assert.strictEqual(overlappingLeave.status, 409, 'Overlapping leave requests should be rejected');

    const myLeave = await request('/leave-requests/my', { headers: employeeHeaders });
    assert.strictEqual(myLeave.status, 200, 'Employee should list own leave requests');
    assert(myLeave.data.data.requests.some((item) => String(item.id) === String(leaveId)));

    const approvedLeave = await request(`/leave-requests/${leaveId}/approve`, {
      method: 'PATCH',
      headers: managerHeaders,
      body: JSON.stringify({ note: 'Approved for the family trip' }),
    });
    assert.strictEqual(approvedLeave.status, 200, 'Assigned manager should approve leave');
    assert.strictEqual(approvedLeave.data.data.request.status, 'approved');

    const wfh = await request('/wfh-requests', {
      method: 'POST',
      headers: employeeHeaders,
      body: JSON.stringify({ startDate: '2026-10-12', endDate: '2026-10-12', reason: 'Home maintenance' }),
    });
    assert.strictEqual(wfh.status, 201, 'Employee should apply for WFH');
    const wfhId = wfh.data.data.request.id;
    createdRequests.push(wfhId);

    const rejectedWfh = await request(`/wfh-requests/${wfhId}/reject`, {
      method: 'PATCH',
      headers: managerHeaders,
      body: JSON.stringify({ note: 'Please use the office that day' }),
    });
    assert.strictEqual(rejectedWfh.status, 200, 'Assigned manager should reject WFH');
    assert.strictEqual(rejectedWfh.data.data.request.status, 'rejected');

    console.log('Leave/WFH integration tests passed: employee apply/list, manager approve/reject.');
  } finally {
    await LeaveRequest.deleteMany({ _id: { $in: createdRequests } });
    await WfhRequest.deleteMany({ _id: { $in: createdRequests } });
    await User.deleteMany({ _id: { $in: createdUsers } });
    await mongoose.disconnect();
  }
})().catch((error) => {
  console.error(`Leave/WFH integration test failed: ${error.message}`);
  process.exit(1);
});