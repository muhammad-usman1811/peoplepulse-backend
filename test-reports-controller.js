const test = require('node:test');
const assert = require('node:assert/strict');
const Attendance = require('./src/models/Attendance');
const LeaveRequest = require('./src/models/LeaveRequest');
const Payslip = require('./src/models/Payslip');
const Review = require('./src/models/Review');
const controller = require('./src/controllers/reportsController');

const originalAggregate = Payslip.aggregate;
const originalAttendanceAggregate = Attendance.aggregate;
const originalLeaveAggregate = LeaveRequest.aggregate;
const originalReviewAggregate = Review.aggregate;

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
  Review.aggregate = originalReviewAggregate;
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
  assert.equal(res.body.data.from, '2026-09-01');
  assert.equal(res.body.data.to, '2026-09-30');
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

  assert.deepEqual(pipeline[0], { $match: { endDate: { $gte: new Date('2026-09-01T00:00:00.000Z') } } });
  assert.equal(res.body.data.total, 4);
  assert.deepEqual(res.body.data.byStatus, { approved: 2, pending: 2 });
  assert.deepEqual(res.body.data.byType, { annual: 3, sick: 1 });
  assert.equal(res.body.data.from, '2026-09-01');
  assert.equal(res.body.data.to, null);
});

test('leave summary includes overlapping and fully inside requests but excludes outside requests', async () => {
  const fixtures = [
    { startDate: new Date('2026-08-30T00:00:00.000Z'), endDate: new Date('2026-09-02T00:00:00.000Z') },
    { startDate: new Date('2026-09-10T00:00:00.000Z'), endDate: new Date('2026-09-12T00:00:00.000Z') },
    { startDate: new Date('2026-10-01T00:00:00.000Z'), endDate: new Date('2026-10-03T00:00:00.000Z') },
  ];
  let filter;
  LeaveRequest.aggregate = async (pipeline) => {
    filter = pipeline[0].$match;
    const matches = fixtures.filter((leave) => (
      leave.startDate <= filter.startDate.$lte && leave.endDate >= filter.endDate.$gte
    ));
    return [{ totals: [{ total: matches.length }], byStatus: [], byType: [] }];
  };

  const res = await runController(controller.getLeaveSummary, {
    query: { from: '2026-09-01', to: '2026-09-30' },
  });

  assert.deepEqual(filter, {
    startDate: { $lte: new Date('2026-09-30T23:59:59.999Z') },
    endDate: { $gte: new Date('2026-09-01T00:00:00.000Z') },
  });
  assert.equal(res.body.data.total, 2);
});

test('leave summary applies only the upper bound when only to is provided', async () => {
  let filter;
  LeaveRequest.aggregate = async (pipeline) => {
    filter = pipeline[0].$match;
    return [{ totals: [], byStatus: [], byType: [] }];
  };

  const res = await runController(controller.getLeaveSummary, { query: { to: '2026-09-30' } });

  assert.deepEqual(filter, {
    startDate: { $lte: new Date('2026-09-30T23:59:59.999Z') },
  });
  assert.equal(res.body.data.from, null);
  assert.equal(res.body.data.to, '2026-09-30');
});

test('attendance summary groups by employee or department when requested', async (t) => {
  for (const groupBy of ['employee', 'department']) {
    await t.test(groupBy, async () => {
      let pipeline;
      Attendance.aggregate = async (value) => {
        pipeline = value;
        return [{
          totals: [{ total: 2, employees: ['employee-id'] }],
          byStatus: [{ _id: 'present', count: 2 }],
          groups: [{ key: groupBy === 'employee' ? 'employee-id' : 'Engineering', label: 'Engineering', count: 2 }],
        }];
      };

      const res = await runController(controller.getAttendanceSummary, {
        query: { from: '2026-09-01', to: '2026-09-30', groupBy },
      });

      assert.equal(res.statusCode, 200);
      assert.equal(res.body.data.groupBy, groupBy);
      assert.equal(res.body.data.groups[0].count, 2);
      assert.deepEqual(pipeline[1].$facet.groups[0], {
        $lookup: { from: 'users', localField: 'employee', foreignField: '_id', as: 'user' },
      });
    });
  }
});

test('attendance summary rejects unsupported groupBy values', async () => {
  let queried = false;
  Attendance.aggregate = async () => { queried = true; return []; };

  const res = await runController(controller.getAttendanceSummary, { query: { groupBy: 'status' } });

  assert.equal(res.statusCode, 400);
  assert.equal(queried, false);
});

test('date reports default to the current UTC calendar month and return that range', async () => {
  Attendance.aggregate = async () => [{ totals: [], byStatus: [] }];
  LeaveRequest.aggregate = async () => [{ totals: [], byStatus: [], byType: [] }];
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);

  const attendance = await runController(controller.getAttendanceSummary, { query: {} });
  const leave = await runController(controller.getLeaveSummary, { query: {} });

  assert.equal(attendance.body.data.from, from);
  assert.equal(attendance.body.data.to, to);
  assert.equal(leave.body.data.from, from);
  assert.equal(leave.body.data.to, to);
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

test('performance summary returns review and rating aggregates', async () => {
  let pipeline;
  Review.aggregate = async (value) => {
    pipeline = value;
    return [{
      totals: [{ reviewCount: 3, managerReviewedCount: 2, averageRating: 4, averageManagerRating: 3.5 }],
      byRating: [{ _id: 4, count: 2 }, { _id: 5, count: 1 }],
    }];
  };

  const res = await runController(controller.getPerformanceSummary, { query: {} });

  assert.equal(res.statusCode, 200);
  assert.deepEqual(pipeline[0], { $match: {} });
  assert.deepEqual(res.body.data, {
    cycleId: null,
    reviewCount: 3,
    managerReviewedCount: 2,
    averageRating: 4,
    averageManagerRating: 3.5,
    byRating: { 4: 2, 5: 1 },
  });
});

test('performance summary validates optional cycleId', async () => {
  let queried = false;
  Review.aggregate = async () => { queried = true; return []; };

  const res = await runController(controller.getPerformanceSummary, { query: { cycleId: 'not-an-id' } });

  assert.equal(res.statusCode, 400);
  assert.equal(queried, false);
});