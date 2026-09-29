const bcrypt = require('bcryptjs');
const Department = require('../models/Department');
const Designation = require('../models/Designation');
const Location = require('../models/Location');
const User = require('../models/User');
const ApiResponse = require('../utils/apiResponse');
const AppError = require('../utils/appError');
const validateManager = require('../utils/managerValidation');
const recordAudit = require('../utils/recordAudit');
const { isValidPhoneNumber } = require('../utils/phoneValidation');

const adminRoles = ['superadmin', 'admin', 'hr'];

const profileFields = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  employeeId: user.employeeId || null,
  phoneNumber: user.phoneNumber || '',
  department: user.department,
  designation: user.designation,
  manager: user.manager
    ? {
        id: user.manager._id,
        name: user.manager.name,
        email: user.manager.email,
      }
    : null,
  notificationPreferences: user.notificationPreferences,
  isActive: user.isActive,
});

const loadProfile = (id) =>
  User.findById(id).populate('manager', 'name email employeeId');

const referenceModels = { department: Department, designation: Designation, location: Location };
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const validateReference = async (field, value) => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new AppError(`${field} must be a non-empty string`, 400);
  }
  const record = await referenceModels[field].findOne({
    name: new RegExp(`^${escapeRegex(value.trim())}$`, 'i'),
  }).select('name').lean();
  if (!record) return null;
  return record.name;
};

exports.getProfile = async (req, res, next) => {
  try {
    const user = await loadProfile(req.user._id);
    return ApiResponse.success(res, 'Profile retrieved successfully', {
      user: profileFields(user),
    });
  } catch (err) {
    next(err);
  }
};

exports.updateProfile = async (req, res, next) => {
  try {
    const { name, phoneNumber, employeeId, department, designation, manager } = req.body;
    const isAdmin = adminRoles.includes(req.user.role);
    const updates = {};

    if (name !== undefined) updates.name = name;
    if (phoneNumber !== undefined) {
      if (phoneNumber !== null && phoneNumber !== '' && !isValidPhoneNumber(phoneNumber)) {
        return ApiResponse.error(res, 'phoneNumber must be a valid phone number', null, 400);
      }
      updates.phoneNumber = phoneNumber || '';
    }

    if (employeeId !== undefined || department !== undefined || designation !== undefined || manager !== undefined) {
      if (!isAdmin) {
        return ApiResponse.error(
          res,
          'Only an administrator can update employee ID, department, designation, or manager',
          null,
          403
        );
      }
      if (employeeId !== undefined) {
        const normalizedEmployeeId = typeof employeeId === 'string' ? employeeId.trim() : employeeId;

        if (normalizedEmployeeId === null || normalizedEmployeeId === '' || normalizedEmployeeId === undefined) {
          updates.$unset = { ...updates.$unset, employeeId: 1 };
        } else {
          updates.employeeId = normalizedEmployeeId;
        }
      }
      if (department !== undefined) {
        const value = await validateReference('department', department);
        if (!value) return ApiResponse.error(res, 'department does not exist', null, 400);
        updates.department = value;
      }
      if (designation !== undefined) {
        const value = await validateReference('designation', designation);
        if (!value) return ApiResponse.error(res, 'designation does not exist', null, 400);
        updates.designation = value;
      }
      if (manager !== undefined) {
        updates.manager = await validateManager(manager, req.user._id);
      }
    }

    if (updates.name !== undefined && (typeof updates.name !== 'string' || !updates.name.trim())) {
      return ApiResponse.error(res, 'Name cannot be empty', null, 400);
    }

    await User.findByIdAndUpdate(req.user._id, updates, {
      new: true,
      runValidators: true,
    });
    const changedFields = [
      ...Object.keys(updates).filter((field) => field !== '$unset'),
      ...Object.keys(updates.$unset || {}),
    ];
    if (changedFields.length) {
      recordAudit({
        req,
        action: 'UPDATE',
        resource: 'User',
        resourceId: req.user._id,
        meta: { changedFields },
      });
    }

    const user = await loadProfile(req.user._id);
    return ApiResponse.success(res, 'Profile updated successfully', {
      user: profileFields(user),
    });
  } catch (err) {
    if (err.code === 11000) {
      return ApiResponse.error(res, 'Employee ID already exists', null, 409);
    }
    next(err);
  }
};

exports.changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return ApiResponse.error(res, 'Current password and new password are required', null, 400);
    }
    if (newPassword.length < 6 || newPassword.length > 72) {
      return ApiResponse.error(res, 'New password must be between 6 and 72 characters', null, 400);
    }

    const user = await User.findById(req.user._id).select('+password');
    if (!(await bcrypt.compare(currentPassword, user.password))) {
      return ApiResponse.error(res, 'Current password is incorrect', null, 401);
    }

    user.password = newPassword;
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save();
    recordAudit({
      req,
      action: 'PASSWORD_RESET',
      resource: 'User',
      resourceId: user._id,
      meta: { flow: 'password_change' },
    });
    return ApiResponse.success(res, 'Password changed successfully');
  } catch (err) {
    next(err);
  }
};

exports.getNotifications = async (req, res, next) => {
  try {
    return ApiResponse.success(res, 'Notification preferences retrieved successfully', {
      notificationPreferences: req.user.notificationPreferences,
    });
  } catch (err) {
    next(err);
  }
};

exports.updateNotifications = async (req, res, next) => {
  try {
    const { email, push } = req.body;
    if (email !== undefined && typeof email !== 'boolean') {
      return ApiResponse.error(res, 'Email notification preference must be boolean', null, 400);
    }
    if (push !== undefined && typeof push !== 'boolean') {
      return ApiResponse.error(res, 'Push notification preference must be boolean', null, 400);
    }
    if (email === undefined && push === undefined) {
      return ApiResponse.error(res, 'Provide email or push notification preference', null, 400);
    }

    const updates = {};
    if (email !== undefined) updates['notificationPreferences.email'] = email;
    if (push !== undefined) updates['notificationPreferences.push'] = push;
    const user = await User.findByIdAndUpdate(req.user._id, updates, {
      new: true,
      runValidators: true,
    });
    recordAudit({
      req,
      action: 'UPDATE',
      resource: 'User',
      resourceId: user._id,
      meta: { changedFields: Object.keys(updates) },
    });

    return ApiResponse.success(res, 'Notification preferences updated successfully', {
      notificationPreferences: user.notificationPreferences,
    });
  } catch (err) {
    next(err);
  }
};