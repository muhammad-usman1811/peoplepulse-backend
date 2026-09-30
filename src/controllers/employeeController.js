const validator = require('validator');
const User = require('../models/User');
const SalaryStructure = require('../models/SalaryStructure');
const Department = require('../models/Department');
const Designation = require('../models/Designation');
const Location = require('../models/Location');
const EmployeeCounter = require('../models/EmployeeCounter');
const ApiResponse = require('../utils/apiResponse');
const AppError = require('../utils/appError');
const validateManager = require('../utils/managerValidation');
const { buildNameSearchTokens, searchDigest } = require('../utils/searchIndex');
const recordAudit = require('../utils/recordAudit');
const { isValidPhoneNumber } = require('../utils/phoneValidation');

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const employeeFields = (employee) => ({
  id: employee._id,
  employeeId: employee.employeeId || null,
  name: employee.name,
  email: employee.email,
  phoneNumber: employee.phoneNumber || '',
  role: employee.role,
  department: employee.department,
  designation: employee.designation,
  location: employee.location || '',
  status: employee.status || 'active',
  salaryStructure: employee.salaryStructure?._id || employee.salaryStructure || null,
  monthlySalary: employee.monthlySalary ?? null,
  manager: employee.manager
    ? { id: employee.manager._id, name: employee.manager.name, email: employee.manager.email }
    : null,
  isActive: employee.isActive,
  createdAt: employee.createdAt,
  updatedAt: employee.updatedAt,
});

const loadEmployee = (id) => User.findById(id).populate('manager', 'name email employeeId');

const findEmployeeTarget = async (id) => User.findOne({ _id: id, role: 'employee' });

const parsePositiveInteger = (value, fallback, maximum = Number.MAX_SAFE_INTEGER) => {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) return null;
  return parsed;
};

const referenceModels = { department: Department, designation: Designation, location: Location };

const validateReference = async (field, value) => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new AppError(`${field} must be a non-empty string`, 400);
  }
  const normalized = value.trim();
  const record = await referenceModels[field].findOne({
    name: new RegExp(`^${escapeRegex(normalized)}$`, 'i'),
  }).select('name').lean();
  if (!record) throw new AppError(`${field} does not exist`, 400);
  return record.name;
};

const nextEmployeeId = async () => {
  const existingCounter = await EmployeeCounter.findById('employee').lean();
  if (!existingCounter) {
    const [highest] = await User.aggregate([
      { $match: { employeeId: /^EMP-\d+$/ } },
      { $project: { sequence: { $toInt: { $substr: ['$employeeId', 4, -1] } } } },
      { $sort: { sequence: -1 } },
      { $limit: 1 },
    ]);
    try {
      await EmployeeCounter.create({ _id: 'employee', sequence: highest?.sequence || 1000 });
    } catch (err) {
      if (err.code !== 11000) throw err;
    }
  }

  const counter = await EmployeeCounter.findOneAndUpdate(
    { _id: 'employee' },
    { $inc: { sequence: 1 } },
    { new: true, runValidators: true }
  ).lean();
  return `EMP-${counter.sequence}`;
};

exports.listEmployees = async (req, res, next) => {
  try {
    const page = parsePositiveInteger(req.query.page, 1);
    const limit = parsePositiveInteger(req.query.limit, 10, 100);
    if (page === null || limit === null) {
      return ApiResponse.error(res, 'page must be a positive integer and limit must be an integer between 1 and 100', null, 400);
    }
    const filter = { role: 'employee', isActive: true };
    const additionalFilters = [];

    if (typeof req.query.department === 'string' && req.query.department.trim()) {
      filter.department = new RegExp(`^${escapeRegex(req.query.department.trim())}$`, 'i');
    } else if (req.query.department !== undefined) {
      return ApiResponse.error(res, 'Department filter must be a string', null, 400);
    }
    if (typeof req.query.designation === 'string' && req.query.designation.trim()) {
      filter.designation = new RegExp(`^${escapeRegex(req.query.designation.trim())}$`, 'i');
    } else if (req.query.designation !== undefined) {
      return ApiResponse.error(res, 'Designation filter must be a string', null, 400);
    }
    if (typeof req.query.location === 'string' && req.query.location.trim()) {
      filter.location = new RegExp(`^${escapeRegex(req.query.location.trim())}$`, 'i');
    } else if (req.query.location !== undefined) {
      return ApiResponse.error(res, 'Location filter must be a string', null, 400);
    }
    if (req.query.status !== undefined) {
      if (!['active', 'on-leave'].includes(req.query.status)) {
        return ApiResponse.error(res, 'status must be active or on-leave', null, 400);
      }
      if (req.query.status === 'active') {
        additionalFilters.push({ $or: [{ status: 'active' }, { status: { $exists: false } }] });
      } else {
        filter.status = req.query.status;
      }
    }
    if (req.query.isActive !== undefined) {
      if (!['true', 'false'].includes(req.query.isActive)) {
        return ApiResponse.error(res, 'isActive must be true or false', null, 400);
      }
      filter.isActive = req.query.isActive === 'true';
    }

    const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';
    if (search) {
      const searchTerms = search.split(/\s+/).filter(Boolean);
      const nameQuery = searchTerms.length > 1
        ? { $and: searchTerms.map((term) => ({ nameSearchTokens: searchDigest(term) })) }
        : { nameSearchTokens: searchDigest(search) };
      const searchQuery = [
        nameQuery,
        { email: { $regex: escapeRegex(search), $options: 'i' } },
        { employeeId: { $regex: escapeRegex(search), $options: 'i' } },
        { phoneNumber: { $regex: escapeRegex(search), $options: 'i' } },
      ];
      additionalFilters.push({ $or: searchQuery });
    }
    if (additionalFilters.length) filter.$and = additionalFilters;

    const [total, records] = await Promise.all([
      User.countDocuments(filter),
      User.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('manager', 'name email employeeId'),
    ]);
    const employees = records.map(employeeFields);

    return ApiResponse.success(res, 'Employees retrieved successfully', {
      employees,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
};

exports.getEmployee = async (req, res, next) => {
  try {
    const employee = await User.findOne({ _id: req.params.id, role: 'employee' })
      .populate('manager', 'name email employeeId');
    if (!employee) return ApiResponse.error(res, 'Employee not found', null, 404);
    return ApiResponse.success(res, 'Employee retrieved successfully', { employee: employeeFields(employee) });
  } catch (err) {
    next(err);
  }
};

exports.createEmployee = async (req, res, next) => {
  try {
    const { name, email, password, employeeId, phoneNumber, department, designation, location, status, manager, salaryStructure, monthlySalary } = req.body;
    if (typeof name !== 'string' || !name.trim() || typeof email !== 'string' || !email.trim() || !validator.isEmail(email.trim()) || typeof password !== 'string' || password.length < 6 || password.length > 72) {
      return ApiResponse.error(res, 'Name, valid email, and password between 6 and 72 characters are required', null, 400);
    }
    if (phoneNumber !== undefined && phoneNumber !== null && phoneNumber !== '' && !isValidPhoneNumber(phoneNumber)) {
      return ApiResponse.error(res, 'phoneNumber must be a valid phone number', null, 400);
    }
    if (employeeId !== undefined && employeeId !== '' && (typeof employeeId !== 'string' || employeeId.trim().length > 64)) {
      return ApiResponse.error(res, 'employeeId must be a string of 64 characters or fewer', null, 400);
    }
    const normalizedEmail = email.trim().toLowerCase();
    if (await User.exists({ email: normalizedEmail })) return ApiResponse.error(res, 'An account with that email already exists', null, 409);
    if (status !== undefined && !['active', 'on-leave'].includes(status)) return ApiResponse.error(res, 'status must be active or on-leave', null, 400);
    if ((salaryStructure === undefined) !== (monthlySalary === undefined)) return ApiResponse.error(res, 'salaryStructure and monthlySalary must be provided together', null, 400);
    if (salaryStructure !== undefined) {
      if (typeof monthlySalary !== 'number' || !Number.isFinite(monthlySalary) || monthlySalary <= 0) return ApiResponse.error(res, 'monthlySalary must be a positive number', null, 400);
      if (!await SalaryStructure.exists({ _id: salaryStructure })) return ApiResponse.error(res, 'Salary structure not found', null, 404);
    }
    const managerId = manager === undefined ? null : await validateManager(manager, null);
    const normalizedDepartment = await validateReference('department', department === undefined ? 'General' : department);
    const normalizedDesignation = await validateReference('designation', designation === undefined ? 'Team Member' : designation);
    const normalizedLocation = location === undefined || location === '' ? '' : await validateReference('location', location);
    const employee = await User.create({
      name: name.trim(), nameSearchTokens: buildNameSearchTokens(name), email: normalizedEmail, password, role: 'employee',
      employeeId: employeeId === undefined || employeeId === '' ? await nextEmployeeId() : employeeId,
      phoneNumber: phoneNumber || '', department: normalizedDepartment, designation: normalizedDesignation,
      location: normalizedLocation, status: status || 'active', manager: managerId,
      salaryStructure: salaryStructure || null, monthlySalary: monthlySalary ?? null,
    });
    recordAudit({
      req,
      action: 'CREATE',
      resource: 'User',
      resourceId: employee._id,
      meta: { changedFields: ['name', 'email', 'employeeId', 'department', 'designation', 'location', 'status', 'manager', ...(salaryStructure !== undefined ? ['salaryStructure', 'monthlySalary'] : [])] },
    });
    const result = await loadEmployee(employee._id);
    return ApiResponse.success(res, 'Employee created successfully', { employee: employeeFields(result) }, 201);
  } catch (err) {
    if (err.code === 11000) return ApiResponse.error(res, 'Employee ID or email already exists', null, 409);
    next(err);
  }
};

exports.updateEmployee = async (req, res, next) => {
  try {
    const allowed = ['name', 'phoneNumber', 'employeeId', 'department', 'designation', 'location', 'status', 'manager', 'isActive', 'salaryStructure', 'monthlySalary'];
    const updates = {};
    for (const field of allowed) if (req.body[field] !== undefined) updates[field] = req.body[field];
    if (updates.name !== undefined && (typeof updates.name !== 'string' || !updates.name.trim())) return ApiResponse.error(res, 'Name cannot be empty', null, 400);
    const unset = {};
    if (updates.employeeId === null || updates.employeeId === '') {
      delete updates.employeeId;
      unset.employeeId = '';
    } else if (updates.employeeId !== undefined && (typeof updates.employeeId !== 'string' || updates.employeeId.trim().length > 64)) {
      return ApiResponse.error(res, 'employeeId must be a string of 64 characters or fewer', null, 400);
    }
    if (updates.phoneNumber !== undefined) {
      if (updates.phoneNumber === null || updates.phoneNumber === '') {
        updates.phoneNumber = '';
      } else if (!isValidPhoneNumber(updates.phoneNumber)) {
        return ApiResponse.error(res, 'phoneNumber must be a valid phone number', null, 400);
      }
    }
    if (updates.status !== undefined && !['active', 'on-leave'].includes(updates.status)) return ApiResponse.error(res, 'status must be active or on-leave', null, 400);
    if (updates.manager !== undefined) updates.manager = await validateManager(updates.manager, req.params.id);
    if (updates.isActive !== undefined && typeof updates.isActive !== 'boolean') return ApiResponse.error(res, 'isActive must be boolean', null, 400);
    if (updates.name !== undefined) updates.nameSearchTokens = buildNameSearchTokens(updates.name);
    for (const field of ['department', 'designation', 'location']) {
      if (updates[field] !== undefined) {
        if (field === 'location' && updates[field] === '') {
          updates[field] = '';
        } else {
          updates[field] = await validateReference(field, updates[field]);
        }
      }
    }

    if (Object.keys(updates).length === 0 && Object.keys(unset).length === 0) {
      return ApiResponse.error(res, 'Provide at least one employee field to update', null, 400);
    }

    const target = await findEmployeeTarget(req.params.id);
    if (!target) return ApiResponse.error(res, 'Employee not found', null, 404);
    if (updates.salaryStructure !== undefined || updates.monthlySalary !== undefined) {
      if (updates.salaryStructure === null && updates.monthlySalary === null) {
        updates.salaryStructure = null;
        updates.monthlySalary = null;
      } else {
        const salaryStructureId = updates.salaryStructure ?? target.salaryStructure;
        const salary = updates.monthlySalary ?? target.monthlySalary;
        if (typeof salary !== 'number' || !Number.isFinite(salary) || salary <= 0) return ApiResponse.error(res, 'monthlySalary must be a positive number', null, 400);
        if (!salaryStructureId || !await SalaryStructure.exists({ _id: salaryStructureId })) return ApiResponse.error(res, 'A valid salaryStructure is required', null, 400);
      }
    }

    const before = {};
    for (const field of ['employeeId', 'department', 'designation', 'location', 'status', 'manager', 'isActive', 'salaryStructure', 'monthlySalary']) {
      if (updates[field] !== undefined || unset[field]) before[field] = target[field];
    }
    const updateOperation = { $set: updates };
    if (Object.keys(unset).length) updateOperation.$unset = unset;
    const employee = await User.findByIdAndUpdate(req.params.id, updateOperation, { new: true, runValidators: true });
    const after = {};
    for (const field of Object.keys(before)) after[field] = employee[field];
    const changedFields = [...new Set([...Object.keys(updates), ...Object.keys(unset)])];
    recordAudit({
      req,
      action: 'UPDATE',
      resource: 'User',
      resourceId: employee._id,
      meta: { changedFields, before, after },
    });
    const result = await loadEmployee(employee._id);
    return ApiResponse.success(res, 'Employee updated successfully', { employee: employeeFields(result) });
  } catch (err) {
    if (err.code === 11000) return ApiResponse.error(res, 'Employee ID already exists', null, 409);
    next(err);
  }
};

exports.deactivateEmployee = async (req, res, next) => {
  try {
    const target = await findEmployeeTarget(req.params.id);
    if (!target) return ApiResponse.error(res, 'Employee not found', null, 404);
    if (String(target._id) === String(req.user._id)) {
      return ApiResponse.error(res, 'You cannot deactivate your own account', null, 400);
    }
    const employee = await User.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true })
      .populate('manager', 'name email employeeId');
    recordAudit({
      req,
      action: 'DEACTIVATE',
      resource: 'User',
      resourceId: employee._id,
      meta: { changedFields: ['isActive'], before: { isActive: target.isActive }, after: { isActive: employee.isActive } },
    });
    return ApiResponse.success(res, 'Employee deactivated successfully', { employee: employeeFields(employee) });
  } catch (err) {
    next(err);
  }
};
