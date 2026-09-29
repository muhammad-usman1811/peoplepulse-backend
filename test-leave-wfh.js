require('dotenv').config();
const assert = require('assert');
const mongoose = require('mongoose');
const dns = require('dns');
const User = require('./src/models/User');
const Attendance = require('./src/models/Attendance');
const LeaveRequest = require('./src/models/LeaveRequest');
const WfhRequest = require('./src/models/WfhRequest');
const SalaryStructure = require('./src/models/SalaryStructure');
const AuditLog = require('./src/models/AuditLog');

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

const assertAuditEntry = async ({ action, resource, resourceId, actorId }) => {
  const entry = await AuditLog.findOne({ action, resource, resourceId: String(resourceId) }).lean();
  assert(entry, `${action} ${resource} should be persisted in MongoDB`);
  assert.strictEqual(String(entry.actor), String(actorId), 'Audit actor should be the authenticated manager');
  assert.strictEqual(entry.resourceId, String(resourceId), 'Audit resource ID should match the affected document');
  assert(entry.createdAt instanceof Date, 'Audit entry should have a timestamp');
  return entry;
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

    const blockedReport = await request('/reports/attendance-summary', { headers: employeeHeaders });
    assert.strictEqual(blockedReport.status, 403, 'Employees must not access HR reports');
    const blockedAudit = await request('/audit-log', { headers: employeeHeaders });
    assert.strictEqual(blockedAudit.status, 403, 'Employees must not access audit logs');

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
    await assertAuditEntry({ action: 'APPROVE', resource: 'LeaveRequest', resourceId: leaveId, actorId: manager._id });

    const rejectedLeaveRequest = await request('/leave-requests', {
      method: 'POST',
      headers: employeeHeaders,
      body: JSON.stringify({ type: 'sick', startDate: '2026-11-05', endDate: '2026-11-05', reason: 'Test rejection' }),
    });
    assert.strictEqual(rejectedLeaveRequest.status, 201, 'Employee should submit a second leave request');
    const rejectedLeaveId = rejectedLeaveRequest.data.data.request.id;
    createdRequests.push(rejectedLeaveId);
    const rejectedLeave = await request(`/leave-requests/${rejectedLeaveId}/reject`, {
      method: 'PATCH',
      headers: managerHeaders,
      body: JSON.stringify({ note: 'Not approved for test' }),
    });
    assert.strictEqual(rejectedLeave.status, 200, 'Assigned manager should reject leave');
    assert.strictEqual(rejectedLeave.data.data.request.status, 'rejected');
    await assertAuditEntry({ action: 'REJECT', resource: 'LeaveRequest', resourceId: rejectedLeaveId, actorId: manager._id });

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
    await assertAuditEntry({ action: 'REJECT', resource: 'WfhRequest', resourceId: wfhId, actorId: manager._id });

    const approvedWfhRequest = await request('/wfh-requests', {
      method: 'POST',
      headers: employeeHeaders,
      body: JSON.stringify({ startDate: '2026-10-13', endDate: '2026-10-13', reason: 'Test approval' }),
    });
    assert.strictEqual(approvedWfhRequest.status, 201, 'Employee should submit a second WFH request');
    const approvedWfhId = approvedWfhRequest.data.data.request.id;
    createdRequests.push(approvedWfhId);
    const approvedWfh = await request(`/wfh-requests/${approvedWfhId}/approve`, {
      method: 'PATCH',
      headers: managerHeaders,
      body: JSON.stringify({ note: 'Approved for test' }),
    });
    assert.strictEqual(approvedWfh.status, 200, 'Assigned manager should approve WFH');
    assert.strictEqual(approvedWfh.data.data.request.status, 'approved');
    await assertAuditEntry({ action: 'APPROVE', resource: 'WfhRequest', resourceId: approvedWfhId, actorId: manager._id });

    const leaveSummary = await request('/reports/leave-summary?from=2026-10-05&to=2026-11-05', { headers: managerHeaders });
    assert.strictEqual(leaveSummary.status, 200, 'Leave summary should return 200');
    const leaveExpected = await LeaveRequest.aggregate([
      { $match: { startDate: { $gte: new Date('2026-10-05T00:00:00.000Z'), $lte: new Date('2026-11-05T23:59:59.999Z') } } },
      { $facet: {
        totals: [{ $count: 'total' }],
        byStatus: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
        byType: [{ $group: { _id: '$type', count: { $sum: 1 } } }],
      } },
    ]);
    const expectedCounts = (items) => Object.fromEntries(items.map(({ _id, count }) => [_id, count]));
    assert.strictEqual(leaveSummary.data.data.total, leaveExpected[0].totals[0]?.total || 0, 'Leave total should match stored requests');
    assert.deepStrictEqual(leaveSummary.data.data.byStatus, expectedCounts(leaveExpected[0].byStatus));
    assert.deepStrictEqual(leaveSummary.data.data.byType, expectedCounts(leaveExpected[0].byType));

    const today = new Date();
    const todayString = today.toISOString().slice(0, 10);
    const attendanceSummary = await request(`/reports/attendance-summary?from=${todayString}&to=${todayString}`, { headers: managerHeaders });
    assert.strictEqual(attendanceSummary.status, 200, 'Attendance summary should return 200');
    const todayStart = new Date(`${todayString}T00:00:00.000Z`);
    const todayEnd = new Date(`${todayString}T23:59:59.999Z`);
    const attendanceExpected = await Attendance.aggregate([
      { $match: { date: { $gte: todayStart, $lte: todayEnd } } },
      { $facet: {
        totals: [{ $group: { _id: null, total: { $sum: 1 }, employees: { $addToSet: '$employee' } } }],
        byStatus: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
      } },
    ]);
    assert.strictEqual(attendanceSummary.data.data.total, attendanceExpected[0].totals[0]?.total || 0, 'Attendance total should match stored records');
    assert.strictEqual(attendanceSummary.data.data.employeeCount, attendanceExpected[0].totals[0]?.employees.length || 0);
    assert.deepStrictEqual(attendanceSummary.data.data.byStatus, expectedCounts(attendanceExpected[0].byStatus));

    const payrollSummary = await request('/reports/payroll-summary', { headers: managerHeaders });
    assert.strictEqual(payrollSummary.status, 200, 'Payroll summary should return 200');
    const salaryStructures = await SalaryStructure.find().select('basicPercentage allowances').lean();
    const allowanceCounts = { fixed: { count: 0, totalValue: 0 }, percentage: { count: 0, totalValue: 0 } };
    for (const structure of salaryStructures) {
      for (const allowance of structure.allowances || []) {
        allowanceCounts[allowance.type].count += 1;
        allowanceCounts[allowance.type].totalValue += allowance.value;
      }
    }
    const averageBasicPercentage = salaryStructures.length
      ? Number((salaryStructures.reduce((sum, item) => sum + item.basicPercentage, 0) / salaryStructures.length).toFixed(2))
      : 0;
    assert.strictEqual(payrollSummary.data.data.structureCount, salaryStructures.length, 'Payroll summary should match stored salary structures');
    assert.strictEqual(payrollSummary.data.data.averageBasicPercentage, averageBasicPercentage);
    assert.strictEqual(payrollSummary.data.data.allowanceCount, allowanceCounts.fixed.count + allowanceCounts.percentage.count);
    assert.deepStrictEqual(payrollSummary.data.data.allowances, allowanceCounts);

    const invalidDate = await request('/reports/leave-summary?from=not-a-date', { headers: managerHeaders });
    assert.strictEqual(invalidDate.status, 400, 'Report date filters should be validated');

    console.log('Leave/WFH and reports integration tests passed: all leave/WFH decisions, stored audit documents, report aggregates, and authorization.');
  } finally {
    await AuditLog.deleteMany({ resourceId: { $in: createdRequests.map(String) } });
    await LeaveRequest.deleteMany({ _id: { $in: createdRequests } });
    await WfhRequest.deleteMany({ _id: { $in: createdRequests } });
    await User.deleteMany({ _id: { $in: createdUsers } });
    await mongoose.disconnect();
  }
})().catch((error) => {
  console.error(`Leave/WFH integration test failed: ${error.message}`);
  process.exit(1);
});