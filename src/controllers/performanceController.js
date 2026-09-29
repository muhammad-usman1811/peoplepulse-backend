const mongoose = require('mongoose');
const PerformanceCycle = require('../models/PerformanceCycle');
const Review = require('../models/Review');
const User = require('../models/User');
const ApiResponse = require('../utils/apiResponse');

const hrRoles = ['hr', 'admin', 'superadmin'];
const goalStatuses = ['not_started', 'in_progress', 'completed'];
const cycleStatuses = ['open', 'closed'];

const parseCycleDate = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.toISOString().slice(0, 10) === value ? date : null;
};

const normalizeGoals = (goals) => {
  if (goals === undefined || goals === null) return [];
  if (!Array.isArray(goals) || goals.length > 20) return null;

  const normalized = [];
  for (const goal of goals) {
    if (!goal || typeof goal !== 'object' || Array.isArray(goal)) return null;
    if (typeof goal.title !== 'string' || !goal.title.trim() || goal.title.trim().length > 200) return null;
    if (goal.description !== undefined && (typeof goal.description !== 'string' || goal.description.length > 1000)) return null;
    const status = goal.status === undefined ? 'not_started' : goal.status;
    if (!goalStatuses.includes(status)) return null;
    const kpis = goal.kpis === undefined ? [] : goal.kpis;
    if (!Array.isArray(kpis) || kpis.length > 20) return null;

    const normalizedKpis = [];
    for (const kpi of kpis) {
      if (!kpi || typeof kpi !== 'object' || Array.isArray(kpi)) return null;
      if (typeof kpi.name !== 'string' || !kpi.name.trim() || kpi.name.trim().length > 120) return null;
      if (typeof kpi.target !== 'number' || !Number.isFinite(kpi.target)) return null;
      if (kpi.actual !== undefined && kpi.actual !== null && (typeof kpi.actual !== 'number' || !Number.isFinite(kpi.actual))) return null;
      if (kpi.unit !== undefined && (typeof kpi.unit !== 'string' || kpi.unit.length > 40)) return null;
      const weight = kpi.weight === undefined ? 0 : kpi.weight;
      if (typeof weight !== 'number' || !Number.isFinite(weight) || weight < 0 || weight > 100) return null;

      normalizedKpis.push({
        name: kpi.name.trim(),
        target: kpi.target,
        actual: kpi.actual === undefined ? null : kpi.actual,
        unit: kpi.unit === undefined ? '' : kpi.unit.trim(),
        weight,
      });
    }

    normalized.push({
      title: goal.title.trim(),
      description: goal.description === undefined ? '' : goal.description.trim(),
      status,
      kpis: normalizedKpis,
    });
  }

  return normalized;
};

exports.createCycle = async (req, res, next) => {
  try {
    const period = typeof req.body.period === 'string' ? req.body.period.trim() : '';
    if (!period) return ApiResponse.error(res, 'period is required', null, 400);
    if (req.body.status !== undefined && !cycleStatuses.includes(req.body.status)) {
      return ApiResponse.error(res, 'status must be open or closed', null, 400);
    }

    const hasStartDate = req.body.startDate !== undefined;
    const hasEndDate = req.body.endDate !== undefined;
    if (hasStartDate !== hasEndDate) {
      return ApiResponse.error(res, 'startDate and endDate must be provided together', null, 400);
    }

    const cycleData = { period, status: req.body.status };
    if (hasStartDate) {
      const startDate = parseCycleDate(req.body.startDate);
      const endDate = parseCycleDate(req.body.endDate);
      if (!startDate || !endDate) {
        return ApiResponse.error(res, 'startDate and endDate must be valid YYYY-MM-DD dates', null, 400);
      }
      if (startDate > endDate) {
        return ApiResponse.error(res, 'startDate cannot be after endDate', null, 400);
      }
      cycleData.startDate = startDate;
      cycleData.endDate = endDate;
    }

    const cycle = await PerformanceCycle.create(cycleData);
    return ApiResponse.success(res, 'Performance cycle created successfully', { cycle }, 201);
  } catch (err) {
    if (err.code === 11000) {
      return ApiResponse.error(res, 'A performance cycle already exists for this period', null, 409);
    }
    next(err);
  }
};

exports.submitSelfReview = async (req, res, next) => {
  try {
    if (req.user.role !== 'employee') {
      return ApiResponse.error(res, 'Only employees can submit a self-review', null, 403);
    }
    if (!mongoose.isValidObjectId(req.params.cycleId)) {
      return ApiResponse.error(res, 'Open performance cycle not found', null, 404);
    }

    const cycle = await PerformanceCycle.findOne({ _id: req.params.cycleId, status: 'open' });
    if (!cycle) return ApiResponse.error(res, 'Open performance cycle not found', null, 404);

    const selfReview = typeof req.body.selfReview === 'string' ? req.body.selfReview.trim() : '';
    const { rating } = req.body;
    if (!selfReview) return ApiResponse.error(res, 'selfReview is required', null, 400);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return ApiResponse.error(res, 'rating must be a whole number from 1 to 5', null, 400);
    }
    const goals = normalizeGoals(req.body.goals);
    if (!goals) {
      return ApiResponse.error(
        res,
        'goals must contain up to 20 valid goals, each with valid KPI targets and optional actuals',
        null,
        400
      );
    }

    const review = await Review.create({
      cycle: cycle._id,
      employee: req.user._id,
      selfReview,
      rating,
      goals,
    });
    return ApiResponse.success(res, 'Self-review submitted successfully', { review }, 201);
  } catch (err) {
    if (err.code === 11000) {
      return ApiResponse.error(res, 'You have already submitted a review for this cycle', null, 409);
    }
    next(err);
  }
};

exports.listTeamReviews = async (req, res, next) => {
  try {
    const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 20, 1), 100);
    const teamMembers = await User.find({ manager: req.user._id, role: 'employee' })
      .select('_id')
      .lean();
    const employeeIds = teamMembers.map((member) => member._id);
    const filter = { employee: { $in: employeeIds } };
    const [reviews, total] = await Promise.all([
      Review.find(filter)
        .sort({ updatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('employee', 'name email employeeId')
        .populate('cycle', 'period status'),
      Review.countDocuments(filter),
    ]);

    return ApiResponse.success(res, 'Team performance reviews retrieved successfully', {
      reviews,
      teamSize: employeeIds.length,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
};

exports.getReview = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.reviewId)) {
      return ApiResponse.error(res, 'Review not found', null, 404);
    }

    const review = await Review.findById(req.params.reviewId)
      .populate('employee', 'name email employeeId manager')
      .populate('cycle', 'period status');
    if (!review) return ApiResponse.error(res, 'Review not found', null, 404);

    const employeeId = review.employee && review.employee._id;
    const managerId = review.employee && review.employee.manager;
    const isEmployee = employeeId && String(employeeId) === String(req.user._id);
    const isManager = managerId && String(managerId) === String(req.user._id);
    const isHr = hrRoles.includes(req.user.role);
    if (!isEmployee && !isManager && !isHr) {
      return ApiResponse.error(res, 'You are not authorized to view this review', null, 403);
    }

    return ApiResponse.success(res, 'Performance review retrieved successfully', { review });
  } catch (err) {
    next(err);
  }
};

exports.submitManagerReview = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.reviewId)) {
      return ApiResponse.error(res, 'Review not found', null, 404);
    }

    const review = await Review.findById(req.params.reviewId)
      .populate('employee', 'name email employeeId manager')
      .populate('cycle', 'period status');
    if (!review) return ApiResponse.error(res, 'Review not found', null, 404);

    const managerId = review.employee && review.employee.manager;
    const isAssignedManager = managerId && String(managerId) === String(req.user._id);
    const isHr = hrRoles.includes(req.user.role);
    if (!isAssignedManager && !isHr) {
      return ApiResponse.error(res, 'Only the assigned manager or HR can submit a manager review', null, 403);
    }

    if (review.cycle && review.cycle.status === 'closed') {
      return ApiResponse.error(res, 'Cannot submit manager review for a closed performance cycle', null, 400);
    }

    const managerReview = typeof req.body.managerReview === 'string' ? req.body.managerReview.trim() : '';
    if (!managerReview) {
      return ApiResponse.error(res, 'managerReview is required', null, 400);
    }
    if (managerReview.length > 5000) {
      return ApiResponse.error(res, 'managerReview cannot exceed 5000 characters', null, 400);
    }

    const rating = req.body.rating !== undefined ? req.body.rating : req.body.managerRating;
    if (rating !== undefined) {
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        return ApiResponse.error(res, 'rating must be a whole number from 1 to 5', null, 400);
      }
      review.managerRating = rating;
      review.rating = rating;
    }

    if (req.body.goals !== undefined) {
      const goals = normalizeGoals(req.body.goals);
      if (!goals) {
        return ApiResponse.error(
          res,
          'goals must contain up to 20 valid goals, each with valid KPI targets and optional actuals',
          null,
          400
        );
      }
      review.goals = goals;
    }

    review.managerReview = managerReview;
    await review.save();

    return ApiResponse.success(res, 'Manager review submitted successfully', { review });
  } catch (err) {
    next(err);
  }
};