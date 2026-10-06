const AuditLog = require('../models/AuditLog');
const ApiResponse = require('../utils/apiResponse');
const mongoose = require('mongoose');

const parseDateBound = (value, endOfDay = false) => {
  if (typeof value !== 'string' || !value.trim()) return null;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  if (dateOnly && date.toISOString().slice(0, 10) !== value) return null;
  if (dateOnly && endOfDay) date.setUTCHours(23, 59, 59, 999);
  return date;
};

// ---------------------------------------------------------------------------
// GET /api/audit-logs
// Query params (all optional):
//   page        – page number (default 1)
//   limit       – results per page (default 20, max 100)
//   actor       – filter by actor ObjectId
//   action      – filter by action enum value (CREATE, UPDATE, DELETE, …)
//   entityType  – filter by resource/entity type (e.g. SalaryStructure)
//   resource    – legacy alias for entityType
//   resourceId  – filter by specific resource document id
//   from        – ISO date string — only entries on or after this date
//   to          – ISO date string — only entries on or before this date
// ---------------------------------------------------------------------------
exports.listAuditLogs = async (req, res, next) => {
  try {
    const parsePositiveInteger = (value, fallback, maximum = Number.MAX_SAFE_INTEGER) => {
      if (value === undefined) return fallback;
      if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
      const parsed = Number(value);
      return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= maximum ? parsed : null;
    };
    const page = parsePositiveInteger(req.query.page, 1);
    const limit = parsePositiveInteger(req.query.limit, 20, 100);
    if (page === null || limit === null) {
      return ApiResponse.error(res, 'page must be a positive integer and limit must be an integer between 1 and 100', null, 400);
    }
    const skip = (page - 1) * limit;

    const filter = {};

    if (req.query.actor !== undefined) {
      if (typeof req.query.actor !== 'string' || !mongoose.isValidObjectId(req.query.actor)) {
        return ApiResponse.error(res, 'actor must be a valid user ID', null, 400);
      }
      filter.actor = req.query.actor;
    }
    if (req.query.action !== undefined) {
      if (typeof req.query.action !== 'string') {
        return ApiResponse.error(res, 'action must be a string', null, 400);
      }
      filter.action = req.query.action.toUpperCase();
    }
    if (req.query.entityType !== undefined || req.query.resource !== undefined) {
      const entityType = req.query.entityType === undefined ? req.query.resource : req.query.entityType;
      if (typeof entityType !== 'string' || !entityType.trim()) {
        return ApiResponse.error(res, 'entityType must be a non-empty string', null, 400);
      }
      filter.resource = entityType.trim();
    }
    if (req.query.resourceId !== undefined) {
      if (typeof req.query.resourceId !== 'string' || !req.query.resourceId.trim()) {
        return ApiResponse.error(res, 'resourceId must be a non-empty string', null, 400);
      }
      filter.resourceId = req.query.resourceId.trim();
    }

    if (req.query.from !== undefined || req.query.to !== undefined) {
      filter.createdAt = {};
      if (req.query.from !== undefined) {
        const from = parseDateBound(req.query.from);
        if (!from) return ApiResponse.error(res, 'Invalid "from" date.', null, 400);
        filter.createdAt.$gte = from;
      }
      if (req.query.to !== undefined) {
        const to = parseDateBound(req.query.to, true);
        if (!to) return ApiResponse.error(res, 'Invalid "to" date.', null, 400);
        filter.createdAt.$lte = to;
      }
      if (filter.createdAt.$gte && filter.createdAt.$lte
        && filter.createdAt.$gte > filter.createdAt.$lte) {
        return ApiResponse.error(res, '"from" date must be on or before "to" date.', null, 400);
      }
    }

    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      AuditLog.countDocuments(filter),
    ]);

    return ApiResponse.success(res, 'Audit logs retrieved successfully.', {
      logs,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// GET /api/audit-logs/:id
// ---------------------------------------------------------------------------
exports.getAuditLog = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return ApiResponse.error(res, 'Invalid audit log ID.', null, 400);
    }
    const log = await AuditLog.findById(req.params.id).lean();

    if (!log) {
      return ApiResponse.error(res, 'Audit log entry not found.', null, 404);
    }

    return ApiResponse.success(res, 'Audit log entry retrieved successfully.', { log });
  } catch (err) {
    if (err.name === 'CastError') {
      return ApiResponse.error(res, 'Invalid audit log ID.', null, 400);
    }
    next(err);
  }
};
