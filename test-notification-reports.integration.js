require('dotenv').config();
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = crypto.randomBytes(32).toString('base64url');
process.env.ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
process.env.MONGO_TEST_URI ||= 'mongodb://127.0.0.1:27017/peoplepulse_notifications_test';
process.env.MONGO_URI = require('./src/utils/testDatabase').getTestMongoUri();

const app = require('./src/server');
const User = require('./src/models/User');
const SalaryStructure = require('./src/models/SalaryStructure');
const Payslip = require('./src/models/Payslip');
const Notification = require('./src/models/Notification');
const Attendance = require('./src/models/Attendance');
const LeaveRequest = require('./src/models/LeaveRequest');
const AuditLog = require('./src/models/AuditLog');

const request = async (baseUrl, path, token, method = 'GET', body) => {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, data: await response.json() };
};

const authToken = (user) => jwt.sign({
  id: user._id,
  tokenVersion: user.tokenVersion || 0,
}, process.env.JWT_SECRET);

test('notification and report APIs persist and aggregate isolated MongoDB test data', { timeout: 60000 }, async () => {
  await mongoose.connection.asPromise();
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, () => resolve(listener));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}/api`;
  const users = [];
  const employeeIds = [];
  const actorIds = [];
  let salaryStructureId;

  try {
    const suffix = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const admin = await User.create({
      name: 'Integration Reports Admin',
      email: `integration.admin.${suffix}@example.test`,
      password: 'IntegrationPass123',
      role: 'admin',
    });
    const finance = await User.create({
      name: 'Integration Finance',
      email: `integration.finance.${suffix}@example.test`,
      password: 'IntegrationPass123',
      role: 'finance',
    });
    const hr = await User.create({
      name: 'Integration HR',
      email: `integration.hr.${suffix}@example.test`,
      password: 'IntegrationPass123',
      role: 'hr',
    });
    users.push(admin, finance, hr);
    actorIds.push(admin._id, finance._id, hr._id);

    const salaryStructure = await SalaryStructure.create({
      grade: `Integration-${suffix}`,
      basicPercentage: 60,
      allowances: [],
    });
    salaryStructureId = salaryStructure._id;

    const employee = await User.create({
      name: 'Integration Employee',
      email: `integration.employee.${suffix}@example.test`,
      password: 'IntegrationPass123',
      role: 'employee',
      manager: admin._id,
      salaryStructure: salaryStructure._id,
      monthlySalary: 100000,
    });
    const otherEmployee = await User.create({
      name: 'Integration Other Employee',
      email: `integration.other.${suffix}@example.test`,
      password: 'IntegrationPass123',
      role: 'employee',
      manager: admin._id,
      salaryStructure: salaryStructure._id,
      monthlySalary: 80000,
    });
    users.push(employee, otherEmployee);
    employeeIds.push(employee._id, otherEmployee._id);

    const adminToken = authToken(admin);
    const financeToken = authToken(finance);
    const hrToken = authToken(hr);
    const employeeToken = authToken(employee);
    const otherEmployeeToken = authToken(otherEmployee);

    const generated = await request(baseUrl, '/payroll/generate', hrToken, 'POST', { month: '2099-11' });
    assert.equal(generated.status, 201);
    const employeePayslip = generated.data.data.payslips.find((slip) => String(slip.employee) === String(employee._id));
    assert.ok(employeePayslip, 'generation should create the employee payslip');

    const approvedPayslip = await request(baseUrl, `/payroll/payslips/${employeePayslip._id}/approve`, financeToken, 'PATCH', {});
    assert.equal(approvedPayslip.status, 200);
    const payslipNotification = await Notification.findOne({ userId: employee._id, type: 'payslip_approved' });
    assert.ok(payslipNotification, 'payslip approval should persist a notification');
    assert.equal(String(payslipNotification.userId), String(employee._id));
    assert.equal(payslipNotification.readAt, null);

    const leaveToApprove = await LeaveRequest.create({
      employee: employee._id,
      approver: admin._id,
      type: 'annual',
      startDate: new Date('2099-11-01T00:00:00.000Z'),
      endDate: new Date('2099-11-02T00:00:00.000Z'),
    });
    const approvedLeave = await request(baseUrl, `/leave-requests/${leaveToApprove._id}/approve`, adminToken, 'PATCH', {});
    assert.equal(approvedLeave.status, 200);
    const leaveNotification = await Notification.findOne({ userId: employee._id, type: 'leave_approved' });
    assert.ok(leaveNotification, 'leave approval should persist a notification');
    assert.equal(leaveNotification.readAt, null);

    await Attendance.create([
      { employee: employee._id, date: new Date('2026-09-01T12:00:00.000Z'), status: 'present' },
      { employee: employee._id, date: new Date('2026-09-15T12:00:00.000Z'), status: 'late' },
      { employee: otherEmployee._id, date: new Date('2026-09-30T12:00:00.000Z'), status: 'absent' },
      { employee: employee._id, date: new Date('2026-10-01T12:00:00.000Z'), status: 'present' },
    ]);
    await LeaveRequest.create([
      { employee: employee._id, approver: admin._id, type: 'annual', status: 'approved', startDate: new Date('2026-09-05T00:00:00.000Z'), endDate: new Date('2026-09-07T00:00:00.000Z') },
      { employee: employee._id, approver: admin._id, type: 'sick', status: 'pending', startDate: new Date('2026-09-18T00:00:00.000Z'), endDate: new Date('2026-09-18T00:00:00.000Z') },
      { employee: otherEmployee._id, approver: admin._id, type: 'casual', status: 'rejected', startDate: new Date('2026-09-27T00:00:00.000Z'), endDate: new Date('2026-09-27T00:00:00.000Z') },
      { employee: employee._id, approver: admin._id, type: 'annual', status: 'approved', startDate: new Date('2026-10-03T00:00:00.000Z'), endDate: new Date('2026-10-05T00:00:00.000Z') },
    ]);

    const attendance = await request(baseUrl, '/reports/attendance-summary?from=2026-09-01&to=2026-09-30', adminToken);
    assert.equal(attendance.status, 200);
    assert.equal(attendance.data.data.total, 3);
    assert.equal(attendance.data.data.employeeCount, 2);
    assert.deepEqual(attendance.data.data.byStatus, { present: 1, late: 1, absent: 1 });

    const attendanceRange = await request(baseUrl, '/reports/attendance-summary?from=2026-09-15&to=2026-09-30', adminToken);
    assert.equal(attendanceRange.data.data.total, 2);
    assert.equal(attendanceRange.data.data.employeeCount, 2);
    assert.deepEqual(attendanceRange.data.data.byStatus, { late: 1, absent: 1 });
    const invalidAttendanceDate = await request(baseUrl, '/reports/attendance-summary?from=2026-02-30', adminToken);
    assert.equal(invalidAttendanceDate.status, 400);

    const leave = await request(baseUrl, '/reports/leave-summary?from=2026-09-01&to=2026-09-30', adminToken);
    assert.equal(leave.status, 200);
    assert.equal(leave.data.data.total, 3);
    assert.deepEqual(leave.data.data.byStatus, { approved: 1, pending: 1, rejected: 1 });
    assert.deepEqual(leave.data.data.byType, { annual: 1, sick: 1, casual: 1 });

    const leaveRange = await request(baseUrl, '/reports/leave-summary?from=2026-09-18&to=2026-09-27', adminToken);
    assert.equal(leaveRange.data.data.total, 2);
    assert.deepEqual(leaveRange.data.data.byStatus, { pending: 1, rejected: 1 });
    assert.deepEqual(leaveRange.data.data.byType, { sick: 1, casual: 1 });
    const invalidLeaveDate = await request(baseUrl, '/reports/leave-summary?to=2026-09-31', adminToken);
    assert.equal(invalidLeaveDate.status, 400);

    const unread = await request(baseUrl, '/notifications?unread=true&limit=10', employeeToken);
    assert.equal(unread.status, 200);
    assert.equal(unread.data.data.notifications.length, 2);
    assert.ok(unread.data.data.notifications[0].createdAt >= unread.data.data.notifications[1].createdAt);
    const notificationId = unread.data.data.notifications[0]._id;
    const markedRead = await request(baseUrl, `/notifications/${notificationId}/read`, employeeToken, 'PATCH');
    assert.equal(markedRead.status, 200);
    const foreignRead = await request(baseUrl, `/notifications/${notificationId}/read`, otherEmployeeToken, 'PATCH');
    assert.equal(foreignRead.status, 404);
    const markAll = await request(baseUrl, '/notifications/read-all', employeeToken, 'PATCH');
    assert.equal(markAll.status, 200);
    assert.equal(markAll.data.data.updatedCount, 1);
    const noUnread = await request(baseUrl, '/notifications?unread=true', employeeToken);
    assert.equal(noUnread.data.data.notifications.length, 0);

    const hrPayslips = await request(baseUrl, '/payroll/payslips', hrToken);
    assert.equal(hrPayslips.status, 200);
    console.log('Passed notification and reports HTTP integration checks against MongoDB.');
  } finally {
    await Notification.deleteMany({ userId: { $in: employeeIds } });
    await Payslip.deleteMany({ employee: { $in: employeeIds } });
    await Attendance.deleteMany({ employee: { $in: employeeIds } });
    await LeaveRequest.deleteMany({ employee: { $in: employeeIds } });
    await AuditLog.deleteMany({ actor: { $in: actorIds } });
    if (salaryStructureId) await SalaryStructure.deleteOne({ _id: salaryStructureId });
    if (users.length) await User.deleteMany({ _id: { $in: users.map((user) => user._id) } });
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await mongoose.disconnect();
  }
});