const AuditLog = require('../models/AuditLog');
const ApiResponse = require('../utils/apiResponse');

// ---------------------------------------------------------------------------
// GET /api/audit-log
// Query params (all optional):
//   page        – page number (default 1)
//   limit       – results per page (default 20, max 100)
//   actor       – filter by actor ObjectId
//   action      – filter by action enum value (CREATE, UPDATE, DELETE, …)
//   resource    – filter by resource type (e.g. SalaryStructure)
//   resourceId  – filter by specific resource document id
//   from        – ISO date string — only entries on or after this date
//   to          – ISO date string — only entries on or before this date
// ---------------------------------------------------------------------------
exports.listAuditLogs = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    // Build dynamic filter
    const filter = {};

    if (req.query.actor) filter.actor = req.query.actor;
    if (req.query.action) filter.action = req.query.action.toUpperCase();
    if (req.query.resource) filter.resource = req.query.resource;
    if (req.query.resourceId) filter.resourceId = req.query.resourceId;

    if (req.query.from || req.query.to) {
      filter.createdAt = {};
      if (req.query.from) {
        const from = new Date(req.query.from);
        if (isNaN(from)) return ApiResponse.error(res, 'Invalid "from" date.', null, 400);
        filter.createdAt.$gte = from;
      }
      if (req.query.to) {
        const to = new Date(req.query.to);
        if (isNaN(to)) return ApiResponse.error(res, 'Invalid "to" date.', null, 400);
        filter.createdAt.$lte = to;
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
// GET /api/audit-log/:id
// ---------------------------------------------------------------------------
exports.getAuditLog = async (req, res, next) => {
  try {
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
