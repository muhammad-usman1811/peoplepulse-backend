const SystemConfig = require('../models/SystemConfig');
const AuditLog = require('../models/AuditLog');
const ApiResponse = require('../utils/apiResponse');

exports.getSystemConfig = async (req, res, next) => {
  try {
    const settings = await SystemConfig.find().sort({ key: 1 }).lean();
    return ApiResponse.success(res, 'System configuration retrieved successfully', { settings });
  } catch (err) {
    next(err);
  }
};

exports.putSystemConfig = async (req, res, next) => {
  try {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return ApiResponse.error(res, 'Request body must be a JSON object', null, 400);
    }
    const { key, value } = req.body;
    if (typeof key !== 'string' || !/^[A-Za-z][A-Za-z0-9._-]{0,99}$/.test(key.trim())) {
      return ApiResponse.error(res, 'key must be 1-100 letters, numbers, dots, underscores, or hyphens and start with a letter', null, 400);
    }
    if (!Object.prototype.hasOwnProperty.call(req.body, 'value')) {
      return ApiResponse.error(res, 'value is required', null, 400);
    }
    const normalizedKey = key.trim();
    const existing = await SystemConfig.findOne({ key: normalizedKey }).lean();
    const setting = await SystemConfig.findOneAndUpdate(
      { key: normalizedKey },
      { $set: { value } },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );

    await AuditLog.record({
      actor: req.user._id,
      actorName: req.user.name || '',
      actorRole: req.user.role || '',
      action: existing ? 'UPDATE' : 'CREATE',
      resource: 'SystemConfig',
      resourceId: normalizedKey,
      meta: {
        before: existing ? existing.value : null,
        after: setting.value,
      },
      req,
    });

    return ApiResponse.success(res, 'System configuration updated successfully', { setting });
  } catch (err) {
    next(err);
  }
};
