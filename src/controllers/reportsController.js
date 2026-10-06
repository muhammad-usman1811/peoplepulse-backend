const Attendance = require('../models/Attendance');
const LeaveRequest = require('../models/LeaveRequest');
const Payslip = require('../models/Payslip');
const Review = require('../models/Review');
const mongoose = require('mongoose');
const ApiResponse = require('../utils/apiResponse');

const parseDateRange = (query, defaultToCurrentMonth = false) => {
  let from = query.from;
  let to = query.to;
  if (defaultToCurrentMonth && from === undefined && to === undefined) {
    const now = new Date();
    from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
    to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
  }

  const range = {};
  for (const [parameter, operator] of [['from', '$gte'], ['to', '$lte']]) {
    const value = parameter === 'from' ? from : to;
    if (value === undefined) continue;
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return { error: `The ${parameter} parameter must use YYYY-MM-DD format` };
    }
    const date = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
      return { error: `The ${parameter} parameter must be a valid date` };
    }
    if (parameter === 'to') date.setUTCHours(23, 59, 59, 999);
    range[operator] = date;
  }
  if (range.$gte && range.$lte && range.$gte > range.$lte) {
    return { error: 'The from date cannot be after the to date' };
  }
  return {
    range,
    from: from || null,
    to: to || null,
  };
};

const groupedCounts = (records) => Object.fromEntries(records.map(({ _id, count }) => [_id, count]));

exports.getAttendanceSummary = async (req, res, next) => {
  try {
    const { groupBy } = req.query;
    if (groupBy !== undefined && !['employee', 'department'].includes(groupBy)) {
      return ApiResponse.error(res, 'groupBy must be employee or department', null, 400);
    }
    const parsed = parseDateRange(req.query, true);
    if (parsed.error) return ApiResponse.error(res, parsed.error, null, 400);

    const facets = {
      totals: [{ $group: { _id: null, total: { $sum: 1 }, employees: { $addToSet: '$employee' } } }],
      byStatus: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
    };
    if (groupBy) {
      facets.groups = [
        { $lookup: { from: 'users', localField: 'employee', foreignField: '_id', as: 'user' } },
        { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
        {
          $group: {
            _id: groupBy === 'employee'
              ? '$employee'
              : { $ifNull: ['$user.department', 'Unassigned'] },
            count: { $sum: 1 },
          },
        },
        { $project: { _id: 0, key: '$_id', count: 1 } },
      ];
    }
    const [result] = await Attendance.aggregate([
      { $match: parsed.range.$gte || parsed.range.$lte ? { date: parsed.range } : {} },
      { $facet: facets },
    ]);
    const totals = result.totals[0] || { total: 0, employees: [] };
    const data = {
      total: totals.total,
      employeeCount: totals.employees.length,
      byStatus: groupedCounts(result.byStatus),
      from: parsed.from,
      to: parsed.to,
    };
    if (groupBy) {
      data.groupBy = groupBy;
      data.groups = result.groups || [];
    }
    return ApiResponse.success(res, 'Attendance summary retrieved successfully', {
      ...data,
    });
  } catch (err) {
    next(err);
  }
};

exports.getLeaveSummary = async (req, res, next) => {
  try {
    const parsed = parseDateRange(req.query, true);
    if (parsed.error) return ApiResponse.error(res, parsed.error, null, 400);

    const filter = {};
    if (parsed.range.$lte) filter.startDate = { $lte: parsed.range.$lte };
    if (parsed.range.$gte) filter.endDate = { $gte: parsed.range.$gte };
    const [result] = await LeaveRequest.aggregate([
      { $match: filter },
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
      from: parsed.from,
      to: parsed.to,
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

exports.getPerformanceSummary = async (req, res, next) => {
  try {
    const { cycleId } = req.query;
    if (cycleId !== undefined && !mongoose.isValidObjectId(cycleId)) {
      return ApiResponse.error(res, 'cycleId must be a valid ID', null, 400);
    }

    const [result] = await Review.aggregate([
      { $match: cycleId ? { cycle: new mongoose.Types.ObjectId(cycleId) } : {} },
      {
        $facet: {
          totals: [{
            $group: {
              _id: null,
              reviewCount: { $sum: 1 },
              averageRating: { $avg: '$rating' },
              averageManagerRating: { $avg: '$managerRating' },
              managerReviewedCount: {
                $sum: { $cond: [{ $ne: ['$managerRating', null] }, 1, 0] },
              },
            },
          }],
          byRating: [{ $group: { _id: '$rating', count: { $sum: 1 } } }],
        },
      },
    ]);
    const totals = result?.totals?.[0] || {};
    return ApiResponse.success(res, 'Performance summary retrieved successfully', {
      cycleId: cycleId || null,
      reviewCount: totals.reviewCount || 0,
      managerReviewedCount: totals.managerReviewedCount || 0,
      averageRating: Number((totals.averageRating || 0).toFixed(2)),
      averageManagerRating: Number((totals.averageManagerRating || 0).toFixed(2)),
      byRating: groupedCounts(result?.byRating || []),
    });
  } catch (err) {
    next(err);
  }
};