const mongoose = require('mongoose');
const User = require('../models/User');
const ApiResponse = require('../utils/apiResponse');

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
  status: employee.status,
  manager: employee.manager
    ? { id: employee.manager._id, name: employee.manager.name, email: employee.manager.email }
    : null,
  isActive: employee.isActive,
  createdAt: employee.createdAt,
  updatedAt: employee.updatedAt,
});

const loadEmployee = (id) => User.findById(id).populate('manager', 'name email employeeId');

const isManagerValidationError = (err) => /manager|selected manager/i.test(err.message || '');

const findEmployeeTarget = async (id) => User.findOne({ _id: id, role: 'employee' });

const nextEmployeeId = async () => {
  const employees = await User.find({ employeeId: /^EMP-\d+$/ }).select('employeeId').lean();
  const highest = employees.reduce((max, employee) => {
    const number = Number(employee.employeeId.slice(4));
    return Number.isInteger(number) && number > max ? number : max;
  }, 1000);
  return `EMP-${highest + 1}`;
};

const validateManager = async (manager, currentId) => {
  if (manager === null || manager === '') return null;
  if (!mongoose.isValidObjectId(manager)) throw new Error('Manager must be a valid user ID');
  if (String(manager) === String(currentId)) throw new Error('A user cannot be their own manager');
  if (!(await User.exists({ _id: manager, isActive: true }))) {
    throw new Error('Selected manager does not exist or is inactive');
  }
  return manager;
};

exports.listEmployees = async (req, res, next) => {
  try {
    const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 10, 1), 100);
    const filter = { role: 'employee', isActive: true };

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
      filter.status = req.query.status;
    }
    if (req.query.isActive !== undefined) {
      if (!['true', 'false'].includes(req.query.isActive)) {
        return ApiResponse.error(res, 'isActive must be true or false', null, 400);
      }
      filter.isActive = req.query.isActive === 'true';
    }

    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    if (search) {
      const searchRegex = new RegExp(escapeRegex(search), 'i');
      const nameMatches = await User.find(filter).select('name');
      const nameIds = nameMatches
        .filter((employee) => employee.name && employee.name.toLowerCase().includes(search.toLowerCase()))
        .map((employee) => employee._id);
      filter.$or = [
        { email: searchRegex },
        { employeeId: searchRegex },
        { phoneNumber: searchRegex },
        { _id: { $in: nameIds } },
      ];
    }

    const total = await User.countDocuments(filter);
    const employees = (await User.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('manager', 'name email employeeId')).map(employeeFields);

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
    if (typeof name !== 'string' || !name.trim() || typeof email !== 'string' || !email.trim() || typeof password !== 'string' || password.length < 6) {
      return ApiResponse.error(res, 'Name, valid email, and password of at least 6 characters are required', null, 400);
    }
    const normalizedEmail = email.trim().toLowerCase();
    if (await User.exists({ email: normalizedEmail })) return ApiResponse.error(res, 'An account with that email already exists', null, 409);
    if (status !== undefined && !['active', 'on-leave'].includes(status)) return ApiResponse.error(res, 'status must be active or on-leave', null, 400);
    const managerId = manager === undefined ? null : await validateManager(manager, null);
    const employee = await User.create({
      name: name.trim(), email: normalizedEmail, password, role: 'employee',
      employeeId: employeeId === undefined || employeeId === '' ? await nextEmployeeId() : employeeId,
      phoneNumber: phoneNumber || '', department: department || 'General', designation: designation || 'Team Member',
      location: location || '', status: status || 'active', manager: managerId,
    });
    const result = await loadEmployee(employee._id);
    return ApiResponse.success(res, 'Employee created successfully', { employee: employeeFields(result) }, 201);
  } catch (err) {
    if (err.code === 11000) return ApiResponse.error(res, 'Employee ID or email already exists', null, 409);
    if (isManagerValidationError(err)) return ApiResponse.error(res, err.message, null, 400);
    next(err);
  }
};

exports.updateEmployee = async (req, res, next) => {
  try {
    const allowed = ['name', 'phoneNumber', 'employeeId', 'department', 'designation', 'location', 'status', 'manager', 'isActive'];
    const updates = {};
    for (const field of allowed) if (req.body[field] !== undefined) updates[field] = req.body[field];
    if (updates.name !== undefined && (typeof updates.name !== 'string' || !updates.name.trim())) return ApiResponse.error(res, 'Name cannot be empty', null, 400);
    if (updates.employeeId === null || updates.employeeId === '') updates.employeeId = undefined;
    if (updates.status !== undefined && !['active', 'on-leave'].includes(updates.status)) return ApiResponse.error(res, 'status must be active or on-leave', null, 400);
    if (updates.manager !== undefined) updates.manager = await validateManager(updates.manager, req.params.id);
    if (updates.isActive !== undefined && typeof updates.isActive !== 'boolean') return ApiResponse.error(res, 'isActive must be boolean', null, 400);

    const target = await findEmployeeTarget(req.params.id);
    if (!target) return ApiResponse.error(res, 'Employee not found', null, 404);
    const employee = await User.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
    const result = await loadEmployee(employee._id);
    return ApiResponse.success(res, 'Employee updated successfully', { employee: employeeFields(result) });
  } catch (err) {
    if (err.code === 11000) return ApiResponse.error(res, 'Employee ID already exists', null, 409);
    if (isManagerValidationError(err)) return ApiResponse.error(res, err.message, null, 400);
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
