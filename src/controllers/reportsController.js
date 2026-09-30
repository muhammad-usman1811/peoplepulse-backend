const Attendance = require('../models/Attendance');
const LeaveRequest = require('../models/LeaveRequest');
const Payslip = require('../models/Payslip');
const ApiResponse = require('../utils/apiResponse');

const parseDateRange = (query, field) => {
  const range = {};
  for (const [parameter, operator] of [['from', '$gte'], ['to', '$lte']]) {
    if (query[parameter] === undefined) continue;
    if (typeof query[parameter] !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(query[parameter])) {
      return { error: `The ${parameter} parameter must use YYYY-MM-DD format` };
    }
    const date = new Date(`${query[parameter]}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== query[parameter]) {
      return { error: `The ${parameter} parameter must be a valid date` };
    }
    if (parameter === 'to') date.setUTCHours(23, 59, 59, 999);
    range[operator] = date;
  }
  if (range.$gte && range.$lte && range.$gte > range.$lte) {
    return { error: 'The from date cannot be after the to date' };
  }
  return { filter: Object.keys(range).length ? { [field]: range } : {} };
};

const groupedCounts = (records) => Object.fromEntries(records.map(({ _id, count }) => [_id, count]));

exports.getAttendanceSummary = async (req, res, next) => {
  try {
    const parsed = parseDateRange(req.query, 'date');
    if (parsed.error) return ApiResponse.error(res, parsed.error, null, 400);

    const [result] = await Attendance.aggregate([
      { $match: parsed.filter },
      {
        $facet: {
          totals: [{ $group: { _id: null, total: { $sum: 1 }, employees: { $addToSet: '$employee' } } }],
          byStatus: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
        },
      },
    ]);
    const totals = result.totals[0] || { total: 0, employees: [] };
    return ApiResponse.success(res, 'Attendance summary retrieved successfully', {
      total: totals.total,
      employeeCount: totals.employees.length,
      byStatus: groupedCounts(result.byStatus),
    });
  } catch (err) {
    next(err);
  }
};

exports.getLeaveSummary = async (req, res, next) => {
  try {
    const parsed = parseDateRange(req.query, 'startDate');
    if (parsed.error) return ApiResponse.error(res, parsed.error, null, 400);

    const [result] = await LeaveRequest.aggregate([
      { $match: parsed.filter },
      {
        $facet: {
          totals: [{ $count: 'total' }],
          byStatus: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
          byType: [{ $group: { _id: '$type', count: { $sum: 1 } } }],
        },
      },
    ]);
    return ApiResponse.success(res, 'Leave summary retrieved successfully', {
      total: result.totals[0]?.total || 0,
      byStatus: groupedCounts(result.byStatus),
      byType: groupedCounts(result.byType),
    });
  } catch (err) {
    next(err);
  }
};

exports.getPayrollSummary = async (req, res, next) => {
  try {
    const { month } = req.query;
    if (month !== undefined && (typeof month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month))) {
      return ApiResponse.error(res, 'month must use YYYY-MM format', null, 400);
    }

    const match = month ? { month } : {};
    const [result] = await Payslip.aggregate([
      { $match: match },
      {
        $facet: {
          totals: [{
            $group: {
              _id: null,
              totalPayslips: { $sum: 1 },
              totalGrossPay: { $sum: '$grossPay' },
              totalDeductions: { $sum: '$deductions' },
              totalNetPay: { $sum: '$netPay' },
              averageNetPay: { $avg: '$netPay' },
            },
          }],
          byStatus: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
        },
      },
    ]);

    const totals = result?.totals?.[0] || {
      totalPayslips: 0,
      totalGrossPay: 0,
      totalDeductions: 0,
      totalNetPay: 0,
      averageNetPay: 0,
    };
    const byStatus = { pending: 0, approved: 0, sent_back: 0 };
    for (const status of result?.byStatus || []) {
      byStatus[status._id] = status.count;
    }

    return ApiResponse.success(res, 'Payroll summary retrieved successfully', {
      month: month || null,
      totalPayslips: totals.totalPayslips,
      totalGrossPay: totals.totalGrossPay,
      totalDeductions: totals.totalDeductions,
      totalNetPay: totals.totalNetPay,
      averageNetPay: Number((totals.averageNetPay || 0).toFixed(2)),
      byStatus,
    });
  } catch (err) {
    next(err);
  }
};