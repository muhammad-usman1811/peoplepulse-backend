const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const ApiResponse = require('../utils/apiResponse');

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
    const setUpdates = {};
    // employeeId has a unique+sparse index: clearing it must $unset the field
    // rather than $set it to undefined/null, both of which either get
    // silently dropped by Mongoose or collide with other cleared users on
    // the unique index.
    const unsetUpdates = {};

    if (name !== undefined) setUpdates.name = name;
    if (phoneNumber !== undefined) setUpdates.phoneNumber = phoneNumber;

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
        if (employeeId) {
          setUpdates.employeeId = employeeId;
        } else {
          unsetUpdates.employeeId = '';
        }
      }
      if (department !== undefined) setUpdates.department = department;
      if (designation !== undefined) setUpdates.designation = designation;
      if (manager !== undefined) {
        if (manager === null || manager === '') {
          setUpdates.manager = null;
        } else if (!mongoose.isValidObjectId(manager)) {
          return ApiResponse.error(res, 'Manager must be a valid user ID', null, 400);
        } else if (String(manager) === String(req.user._id)) {
          return ApiResponse.error(res, 'A user cannot be their own manager', null, 400);
        } else if (!(await User.exists({ _id: manager, isActive: true }))) {
          return ApiResponse.error(res, 'Selected manager does not exist or is inactive', null, 400);
        } else {
          setUpdates.manager = manager;
        }
      }
    }

    if (setUpdates.name !== undefined && (typeof setUpdates.name !== 'string' || !setUpdates.name.trim())) {
      return ApiResponse.error(res, 'Name cannot be empty', null, 400);
    }

    const updateDoc = {};
    if (Object.keys(setUpdates).length) updateDoc.$set = setUpdates;
    if (Object.keys(unsetUpdates).length) updateDoc.$unset = unsetUpdates;

    if (Object.keys(updateDoc).length) {
      await User.findByIdAndUpdate(req.user._id, updateDoc, {
        new: true,
        runValidators: true,
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
    if (newPassword.length < 6 || newPassword.length > 128) {
      return ApiResponse.error(res, 'New password must be between 6 and 128 characters', null, 400);
    }

    const user = await User.findById(req.user._id).select('+password');
    if (!(await bcrypt.compare(currentPassword, user.password))) {
      return ApiResponse.error(res, 'Current password is incorrect', null, 401);
    }

    user.password = newPassword;
    await user.save();
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

    return ApiResponse.success(res, 'Notification preferences updated successfully', {
      notificationPreferences: user.notificationPreferences,
    });
  } catch (err) {
    next(err);
  }
};