const validator = require('validator');
const User = require('../models/User');
const Department = require('../models/Department');
const Designation = require('../models/Designation');
const Location = require('../models/Location');
const EmployeeCounter = require('../models/EmployeeCounter');
const AuditLog = require('../models/AuditLog');
const ApiResponse = require('../utils/apiResponse');
const AppError = require('../utils/appError');
const validateManager = require('../utils/managerValidation');
const { buildNameSearchTokens, searchDigest } = require('../utils/searchIndex');

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
  manager: employee.manager
    ? { id: employee.manager._id, name: employee.manager.name, email: employee.manager.email }
    : null,
  isActive: employee.isActive,
  createdAt: employee.createdAt,
  updatedAt: employee.updatedAt,
});

const loadEmployee = (id) => User.findById(id).populate('manager', 'name email employeeId');

const findEmployeeTarget = async (id) => User.findOne({ _id: id, role: 'employee' });

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
    const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 10, 1), 100);
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
    const { name, email, password, employeeId, phoneNumber, department, designation, location, status, manager } = req.body;
    if (typeof name !== 'string' || !name.trim() || typeof email !== 'string' || !email.trim() || !validator.isEmail(email.trim()) || typeof password !== 'string' || password.length < 6 || password.length > 72) {
      return ApiResponse.error(res, 'Name, valid email, and password between 6 and 72 characters are required', null, 400);
    }
    const normalizedEmail = email.trim().toLowerCase();
    if (await User.exists({ email: normalizedEmail })) return ApiResponse.error(res, 'An account with that email already exists', null, 409);
    if (status !== undefined && !['active', 'on-leave'].includes(status)) return ApiResponse.error(res, 'status must be active or on-leave', null, 400);
    const managerId = manager === undefined ? null : await validateManager(manager, null);
    const normalizedDepartment = await validateReference('department', department === undefined ? 'General' : department);
    const normalizedDesignation = await validateReference('designation', designation === undefined ? 'Team Member' : designation);
    const normalizedLocation = location === undefined || location === '' ? '' : await validateReference('location', location);
    const employee = await User.create({
      name: name.trim(), nameSearchTokens: buildNameSearchTokens(name), email: normalizedEmail, password, role: 'employee',
      employeeId: employeeId === undefined || employeeId === '' ? await nextEmployeeId() : employeeId,
      phoneNumber: phoneNumber || '', department: normalizedDepartment, designation: normalizedDesignation,
      location: normalizedLocation, status: status || 'active', manager: managerId,
    });
    await AuditLog.record({
      actor: req.user._id,
      actorName: req.user.name || '',
      actorRole: req.user.role || '',
      action: 'CREATE',
      resource: 'Employee',
      resourceId: employee._id,
      meta: { employeeId: employee.employeeId, email: employee.email },
      req,
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
    const allowed = ['name', 'phoneNumber', 'employeeId', 'department', 'designation', 'location', 'status', 'manager', 'isActive'];
    const updates = {};
    for (const field of allowed) if (req.body[field] !== undefined) updates[field] = req.body[field];
    if (updates.name !== undefined && (typeof updates.name !== 'string' || !updates.name.trim())) return ApiResponse.error(res, 'Name cannot be empty', null, 400);
    const unset = {};
    if (updates.employeeId === null || updates.employeeId === '') {
      delete updates.employeeId;
      unset.employeeId = '';
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

    const target = await findEmployeeTarget(req.params.id);
    if (!target) return ApiResponse.error(res, 'Employee not found', null, 404);
    const updateOperation = { $set: updates };
    if (Object.keys(unset).length) updateOperation.$unset = unset;
    const employee = await User.findByIdAndUpdate(req.params.id, updateOperation, { new: true, runValidators: true });
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
    return ApiResponse.success(res, 'Employee deactivated successfully', { employee: employeeFields(employee) });
  } catch (err) {
    next(err);
  }
};
