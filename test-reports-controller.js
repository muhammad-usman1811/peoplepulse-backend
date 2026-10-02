const test = require('node:test');
const assert = require('node:assert/strict');
const Attendance = require('./src/models/Attendance');
const LeaveRequest = require('./src/models/LeaveRequest');
const Payslip = require('./src/models/Payslip');
const controller = require('./src/controllers/reportsController');

const originalAggregate = Payslip.aggregate;
const originalAttendanceAggregate = Attendance.aggregate;
const originalLeaveAggregate = LeaveRequest.aggregate;

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
  Payslip.aggregate = originalAggregate;
  Attendance.aggregate = originalAttendanceAggregate;
  LeaveRequest.aggregate = originalLeaveAggregate;
});

test('attendance summary returns Mongo aggregate totals and status counts', async () => {
  let pipeline;
  Attendance.aggregate = async (value) => {
    pipeline = value;
    return [{
      totals: [{ total: 3, employees: ['employee-a', 'employee-b'] }],
      byStatus: [{ _id: 'present', count: 2 }, { _id: 'late', count: 1 }],
    }];
  };

  const res = await runController(controller.getAttendanceSummary, {
    query: { from: '2026-09-01', to: '2026-09-30' },
  });

  assert.deepEqual(pipeline[0], {
    $match: { date: { $gte: new Date('2026-09-01T00:00:00.000Z'), $lte: new Date('2026-09-30T23:59:59.999Z') } },
  });
  assert.equal(res.body.data.total, 3);
  assert.equal(res.body.data.employeeCount, 2);
  assert.deepEqual(res.body.data.byStatus, { present: 2, late: 1 });
});

test('leave summary returns Mongo aggregate totals by status and type', async () => {
  let pipeline;
  LeaveRequest.aggregate = async (value) => {
    pipeline = value;
    return [{
      totals: [{ total: 4 }],
      byStatus: [{ _id: 'approved', count: 2 }, { _id: 'pending', count: 2 }],
      byType: [{ _id: 'annual', count: 3 }, { _id: 'sick', count: 1 }],
    }];
  };

  const res = await runController(controller.getLeaveSummary, { query: { from: '2026-09-01' } });

  assert.deepEqual(pipeline[0], { $match: { startDate: { $gte: new Date('2026-09-01T00:00:00.000Z') } } });
  assert.equal(res.body.data.total, 4);
  assert.deepEqual(res.body.data.byStatus, { approved: 2, pending: 2 });
  assert.deepEqual(res.body.data.byType, { annual: 3, sick: 1 });
});

test('payroll summary aggregates actual payslip values and filters by month', async () => {
  let pipeline;
  Payslip.aggregate = async (value) => {
    pipeline = value;
    return [{
      totals: [{
        totalPayslips: 2,
        totalGrossPay: 180000,
        totalDeductions: 12000,
        totalNetPay: 168000,
        averageNetPay: 84000,
      }],
      byStatus: [{ _id: 'approved', count: 1 }, { _id: 'pending', count: 1 }],
    }];
  };

  const res = await runController(controller.getPayrollSummary, { query: { month: '2026-09' } });

  assert.equal(res.statusCode, 200);
  assert.deepEqual(pipeline[0], { $match: { month: '2026-09' } });
  assert.deepEqual(res.body.data, {
    month: '2026-09',
    totalPayslips: 2,
    totalGrossPay: 180000,
    totalDeductions: 12000,
    totalNetPay: 168000,
    averageNetPay: 84000,
    byStatus: { pending: 1, approved: 1, sent_back: 0 },
  });
});

test('payroll summary returns zero totals when no payslips match', async () => {
  Payslip.aggregate = async () => [{ totals: [], byStatus: [] }];

  const res = await runController(controller.getPayrollSummary, { query: {} });

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.data, {
    month: null,
    totalPayslips: 0,
    totalGrossPay: 0,
    totalDeductions: 0,
    totalNetPay: 0,
    averageNetPay: 0,
    byStatus: { pending: 0, approved: 0, sent_back: 0 },
  });
});

test('payroll summary rejects an invalid month before querying MongoDB', async () => {
  let queried = false;
  Payslip.aggregate = async () => { queried = true; return []; };

  const res = await runController(controller.getPayrollSummary, { query: { month: '2026-13' } });

  assert.equal(res.statusCode, 400);
  assert.equal(queried, false);
});