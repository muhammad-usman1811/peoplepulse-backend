const SalaryStructure = require('../models/SalaryStructure');
const User = require('../models/User');
const Payslip = require('../models/Payslip');
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

const roundMoney = (amount) => Math.round((amount + Number.EPSILON) * 100) / 100;

const calculatePayslip = (monthlySalary, salaryStructure) => {
  const basicPay = roundMoney(monthlySalary * salaryStructure.basicPercentage / 100);
  const allowances = salaryStructure.allowances.map((allowance) => ({
    name: allowance.name,
    type: allowance.type,
    value: allowance.value,
    amount: roundMoney(allowance.type === 'fixed' ? allowance.value : basicPay * allowance.value / 100),
  }));
  const grossPay = roundMoney(basicPay + allowances.reduce((total, allowance) => total + allowance.amount, 0));
  return { basicPay, allowances, grossPay, deductions: 0, netPay: grossPay };
};

const validMonth = (month) => typeof month === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(month);

exports.calculatePayslip = calculatePayslip;

exports.generatePayslips = async (req, res, next) => {
  try {
    const { month } = req.body;
    if (!validMonth(month)) return ApiResponse.error(res, 'month must use YYYY-MM format', null, 400);

    const employees = await User.find({ role: 'employee', isActive: true })
      .populate('salaryStructure');
    const unassignedEmployees = employees.filter((employee) => (
      !employee.salaryStructure || typeof employee.monthlySalary !== 'number' || employee.monthlySalary <= 0
    ));
    if (unassignedEmployees.length) {
      return ApiResponse.error(res, 'Every active employee must have a salary structure and positive monthly salary before payroll generation', {
        employeeIds: unassignedEmployees.map((employee) => employee._id),
      }, 400);
    }

    for (const employee of employees) {
      if (await Payslip.exists({ employee: employee._id, month })) {
        return ApiResponse.error(res, `A payslip already exists for ${month}`, null, 409);
      }
    }

    const payslips = [];
    for (const employee of employees) {
      const amounts = calculatePayslip(employee.monthlySalary, employee.salaryStructure);
      const payslip = await Payslip.create({
        employee: employee._id,
        month,
        salaryStructure: { id: employee.salaryStructure._id, grade: employee.salaryStructure.grade },
        monthlySalary: employee.monthlySalary,
        ...amounts,
      });
      await AuditLog.record({
        ...actorFrom(req),
        action: 'CREATE',
        resource: 'Payslip',
        resourceId: payslip._id,
        meta: { employee: employee._id, month, grossPay: payslip.grossPay, netPay: payslip.netPay },
      });
      payslips.push(payslip);
    }

    return ApiResponse.success(res, 'Payslips generated successfully.', { payslips, count: payslips.length }, 201);
  } catch (err) {
    if (err.code === 11000) return ApiResponse.error(res, 'A payslip already exists for this employee and month', null, 409);
    next(err);
  }
};

const decidePayslip = (decision) => async (req, res, next) => {
  try {
    if (decision === 'send_back' && req.body.note !== undefined && typeof req.body.note !== 'string') {
      return ApiResponse.error(res, 'note must be a string', null, 400);
    }
    if (decision === 'send_back' && req.body.note?.length > 500) {
      return ApiResponse.error(res, 'note must not exceed 500 characters', null, 400);
    }
    const existing = await Payslip.findById(req.params.id);
    if (!existing) return ApiResponse.error(res, 'Payslip not found.', null, 404);
    if (existing.status !== 'pending') return ApiResponse.error(res, 'Only pending payslips can be decided.', null, 409);

    const updates = decision === 'approve'
      ? { status: 'approved', approvedBy: req.user._id, approvedAt: new Date(), decisionNote: '' }
      : { status: 'sent_back', decisionNote: req.body.note?.trim() || '' };
    const payslip = await Payslip.findOneAndUpdate(
      { _id: existing._id, status: 'pending' },
      { $set: updates },
      { new: true, runValidators: true }
    );
    if (!payslip) return ApiResponse.error(res, 'Payslip has already been decided.', null, 409);

    await AuditLog.record({
      ...actorFrom(req),
      action: decision === 'approve' ? 'APPROVE' : 'REJECT',
      resource: 'Payslip',
      resourceId: payslip._id,
      meta: { month: payslip.month, employee: payslip.employee, status: payslip.status, note: payslip.decisionNote },
    });
    return ApiResponse.success(res, decision === 'approve' ? 'Payslip approved.' : 'Payslip sent back.', { payslip });
  } catch (err) {
    if (err.name === 'CastError') return ApiResponse.error(res, 'Invalid payslip ID.', null, 400);
    next(err);
  }
};

exports.approvePayslip = decidePayslip('approve');
exports.sendBackPayslip = decidePayslip('send_back');

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
