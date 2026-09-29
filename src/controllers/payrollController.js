const SalaryStructure = require('../models/SalaryStructure');
const AuditLog = require('../models/AuditLog');
const ApiResponse = require('../utils/apiResponse');

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const normalizeAllowances = (allowances) => {
  if (allowances === undefined) return [];
  if (!Array.isArray(allowances)) return null;

  const normalized = [];
  for (const allowance of allowances) {
    if (!allowance || typeof allowance !== 'object' || Array.isArray(allowance)) return null;
    normalized.push({
      name: typeof allowance.name === 'string' ? allowance.name.trim() : allowance.name,
      type: allowance.type || 'percentage',
      value: allowance.value,
    });
  }
  return normalized;
};

/** Pull actor info from req.user for audit log entries */
const actorFrom = (req) => ({
  actor: req.user._id,
  actorName: req.user.name || '',
  actorRole: req.user.role || '',
  req,
});

// ---------------------------------------------------------------------------
// GET /api/payroll/salary-structure
// ---------------------------------------------------------------------------
exports.listSalaryStructures = async (req, res, next) => {
  try {
    const salaryStructures = await SalaryStructure.find().sort({ grade: 1 });
    return ApiResponse.success(res, 'Salary structures retrieved successfully.', {
      salaryStructures,
    });
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// GET /api/payroll/salary-structure/:id
// ---------------------------------------------------------------------------
exports.getSalaryStructure = async (req, res, next) => {
  try {
    const salaryStructure = await SalaryStructure.findById(req.params.id);

    if (!salaryStructure) {
      return ApiResponse.error(res, 'Salary structure not found.', null, 404);
    }

    return ApiResponse.success(res, 'Salary structure retrieved successfully.', {
      salaryStructure,
    });
  } catch (err) {
    if (err.name === 'CastError') {
      return ApiResponse.error(res, 'Invalid salary structure ID.', null, 400);
    }
    next(err);
  }
};

// ---------------------------------------------------------------------------
// POST /api/payroll/salary-structure
// ---------------------------------------------------------------------------
exports.createSalaryStructure = async (req, res, next) => {
  try {
    const grade = typeof req.body.grade === 'string' ? req.body.grade.trim() : '';
    const basicPercentage = req.body.basicPercentage;
    const allowances = normalizeAllowances(req.body.allowances);

    if (!grade) return ApiResponse.error(res, 'grade is required', null, 400);
    if (typeof basicPercentage !== 'number' || !Number.isFinite(basicPercentage)) {
      return ApiResponse.error(res, 'basicPercentage must be a number', null, 400);
    }
    if (basicPercentage < 0 || basicPercentage > 100) {
      return ApiResponse.error(res, 'basicPercentage must be between 0 and 100', null, 400);
    }
    if (allowances === null) {
      return ApiResponse.error(res, 'allowances must be an array', null, 400);
    }

    const salaryStructure = await SalaryStructure.create({
      grade,
      basicPercentage,
      allowances,
    });

    await AuditLog.record({
      ...actorFrom(req),
      action: 'CREATE',
      resource: 'SalaryStructure',
      resourceId: salaryStructure._id,
      meta: { grade, basicPercentage, allowances },
    });

    return ApiResponse.success(
      res,
      'Salary structure created successfully.',
      { salaryStructure },
      201
    );
  } catch (err) {
    if (err.code === 11000) {
      return ApiResponse.error(res, 'A salary structure for this grade already exists.', null, 409);
    }
    if (err.name === 'ValidationError') {
      return ApiResponse.error(
        res,
        Object.values(err.errors).map((error) => error.message).join(', '),
        null,
        400
      );
    }
    next(err);
  }
};

// ---------------------------------------------------------------------------
// PUT /api/payroll/salary-structure/:id
// ---------------------------------------------------------------------------
exports.updateSalaryStructure = async (req, res, next) => {
  try {
    const existing = await SalaryStructure.findById(req.params.id);
    if (!existing) {
      return ApiResponse.error(res, 'Salary structure not found.', null, 404);
    }

    // Build update payload from only the fields provided in the request
    const updates = {};

    if (req.body.grade !== undefined) {
      const grade = typeof req.body.grade === 'string' ? req.body.grade.trim() : '';
      if (!grade) return ApiResponse.error(res, 'grade cannot be empty', null, 400);
      updates.grade = grade;
    }

    if (req.body.basicPercentage !== undefined) {
      const basicPercentage = req.body.basicPercentage;
      if (typeof basicPercentage !== 'number' || !Number.isFinite(basicPercentage)) {
        return ApiResponse.error(res, 'basicPercentage must be a number', null, 400);
      }
      if (basicPercentage < 0 || basicPercentage > 100) {
        return ApiResponse.error(res, 'basicPercentage must be between 0 and 100', null, 400);
      }
      updates.basicPercentage = basicPercentage;
    }

    if (req.body.allowances !== undefined) {
      const allowances = normalizeAllowances(req.body.allowances);
      if (allowances === null) {
        return ApiResponse.error(res, 'allowances must be an array', null, 400);
      }
      updates.allowances = allowances;
    }

    if (Object.keys(updates).length === 0) {
      return ApiResponse.error(
        res,
        'No valid fields provided for update. Accepted: grade, basicPercentage, allowances.',
        null,
        400
      );
    }

    // Capture before-state for the audit log
    const before = {
      grade: existing.grade,
      basicPercentage: existing.basicPercentage,
      allowances: existing.allowances,
    };

    const salaryStructure = await SalaryStructure.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true, runValidators: true }
    );

    await AuditLog.record({
      ...actorFrom(req),
      action: 'UPDATE',
      resource: 'SalaryStructure',
      resourceId: salaryStructure._id,
      meta: { before, after: updates },
    });

    return ApiResponse.success(res, 'Salary structure updated successfully.', { salaryStructure });
  } catch (err) {
    if (err.name === 'CastError') {
      return ApiResponse.error(res, 'Invalid salary structure ID.', null, 400);
    }
    if (err.code === 11000) {
      return ApiResponse.error(res, 'A salary structure for this grade already exists.', null, 409);
    }
    if (err.name === 'ValidationError') {
      return ApiResponse.error(
        res,
        Object.values(err.errors).map((error) => error.message).join(', '),
        null,
        400
      );
    }
    next(err);
  }
};

// ---------------------------------------------------------------------------
// DELETE /api/payroll/salary-structure/:id
// ---------------------------------------------------------------------------
exports.deleteSalaryStructure = async (req, res, next) => {
  try {
    const salaryStructure = await SalaryStructure.findById(req.params.id);
    if (!salaryStructure) {
      return ApiResponse.error(res, 'Salary structure not found.', null, 404);
    }

    await salaryStructure.deleteOne();

    await AuditLog.record({
      ...actorFrom(req),
      action: 'DELETE',
      resource: 'SalaryStructure',
      resourceId: req.params.id,
      meta: {
        grade: salaryStructure.grade,
        basicPercentage: salaryStructure.basicPercentage,
      },
    });

    return ApiResponse.success(res, 'Salary structure deleted successfully.');
  } catch (err) {
    if (err.name === 'CastError') {
      return ApiResponse.error(res, 'Invalid salary structure ID.', null, 400);
    }
    next(err);
  }
};
