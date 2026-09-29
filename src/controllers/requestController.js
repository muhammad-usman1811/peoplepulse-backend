const mongoose = require('mongoose');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const ApiResponse = require('../utils/apiResponse');

const requestFields = (request) => ({
  id: request._id,
  employee: request.employee
    ? { id: request.employee._id, name: request.employee.name, email: request.employee.email, employeeId: request.employee.employeeId }
    : request.employee,
  type: request.type,
  startDate: request.startDate,
  endDate: request.endDate,
  reason: request.reason,
  status: request.status,
  approver: request.approver
    ? { id: request.approver._id, name: request.approver.name, email: request.approver.email }
    : request.approver,
  decisionNote: request.decisionNote,
  decidedAt: request.decidedAt,
  createdAt: request.createdAt,
  updatedAt: request.updatedAt,
});

const parseDates = (startDate, endDate) => {
  const parseDate = (value) => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
      ? date
      : null;
  };
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  if (!start || !end) {
    return { error: 'startDate and endDate must use a valid YYYY-MM-DD date' };
  }
  if (start > end) return { error: 'startDate cannot be after endDate' };
  return { start, end };
};

const populated = (Model, query) => Model.findOne(query)
  .populate('employee', 'name email employeeId')
  .populate('approver', 'name email employeeId');

const createRequestController = ({ Model, label, allowedTypes }) => ({
  apply: async (req, res, next) => {
    try {
      if (req.user.role !== 'employee') {
        return ApiResponse.error(res, 'Only employees can submit requests', null, 403);
      }
      if (!req.user.manager) {
        return ApiResponse.error(res, 'You must have an assigned manager before submitting a request', null, 400);
      }
      if (!(await User.exists({ _id: req.user.manager, isActive: true }))) {
        return ApiResponse.error(res, 'Your assigned manager is inactive or no longer exists', null, 400);
      }

      const { type, startDate, endDate, reason } = req.body;
      if (allowedTypes && (!type || !allowedTypes.includes(type))) {
        return ApiResponse.error(res, `type must be one of: ${allowedTypes.join(', ')}`, null, 400);
      }
      const dates = parseDates(startDate, endDate);
      if (dates.error) return ApiResponse.error(res, dates.error, null, 400);
      if (reason !== undefined && (typeof reason !== 'string' || reason.trim().length > 500)) {
        return ApiResponse.error(res, 'reason must be a string of 500 characters or fewer', null, 400);
      }
      const overlapping = await Model.exists({
        employee: req.user._id,
        status: { $in: ['pending', 'approved'] },
        startDate: { $lte: dates.end },
        endDate: { $gte: dates.start },
      });
      if (overlapping) {
        return ApiResponse.error(res, 'This request overlaps an existing pending or approved request', null, 409);
      }

      const request = await Model.create({
        employee: req.user._id,
        type,
        startDate: dates.start,
        endDate: dates.end,
        reason: typeof reason === 'string' ? reason.trim() : '',
        approver: req.user.manager,
      });
      const result = await populated(Model, { _id: request._id });
      return ApiResponse.success(res, `${label} request submitted successfully`, { request: requestFields(result) }, 201);
    } catch (err) {
      next(err);
    }
  },

  listMine: async (req, res, next) => {
    try {
      const requests = await Model.find({ employee: req.user._id })
        .sort({ createdAt: -1 })
        .populate('employee', 'name email employeeId')
        .populate('approver', 'name email employeeId');
      return ApiResponse.success(res, `${label} requests retrieved successfully`, {
        requests: requests.map(requestFields),
      });
    } catch (err) {
      next(err);
    }
  },

  approve: async (req, res, next) => decide(Model, label, req, res, next, 'approved'),
  reject: async (req, res, next) => decide(Model, label, req, res, next, 'rejected'),
});

const decide = async (Model, label, req, res, next, status) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return ApiResponse.error(res, `${label} request not found`, null, 404);
    }
    const decisionNote = typeof req.body.note === 'string' ? req.body.note.trim() : '';
    if (req.body.note !== undefined && (typeof req.body.note !== 'string' || decisionNote.length > 500)) {
      return ApiResponse.error(res, 'note must be a string of 500 characters or fewer', null, 400);
    }
    const request = await Model.findOneAndUpdate({
      _id: req.params.id,
      approver: req.user._id,
      status: 'pending',
    }, {
      $set: { status, decisionNote, decidedAt: new Date() },
    }, { new: true, runValidators: true });
    if (!request) {
      return ApiResponse.error(res, `Pending ${label.toLowerCase()} request not found for this manager`, null, 404);
    }
    await AuditLog.record({
      actor: req.user._id,
      actorName: req.user.name || '',
      actorRole: req.user.role || '',
      action: status === 'approved' ? 'APPROVE' : 'REJECT',
      resource: Model.modelName,
      resourceId: request._id,
      meta: { status, decisionNote: request.decisionNote, employee: request.employee },
      req,
    });
    const result = await populated(Model, { _id: request._id });
    return ApiResponse.success(res, `${label} request ${status} successfully`, { request: requestFields(result) });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  leave: createRequestController({
    Model: require('../models/LeaveRequest'),
    label: 'Leave',
    allowedTypes: ['annual', 'sick', 'casual', 'unpaid'],
  }),
  wfh: createRequestController({
    Model: require('../models/WfhRequest'),
    label: 'WFH',
  }),
};