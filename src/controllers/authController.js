const validator = require('validator');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const ApiResponse = require('../utils/apiResponse');
const { hashToken } = require('../utils/cryptoUtils');
const { isEmailConfigured, sendResetPasswordEmail } = require('../utils/sendEmail');
const { resolveResetBaseUrl } = require('../utils/resetBaseUrl');
const recordAudit = require('../utils/recordAudit');

// Hash of a random, discarded value at the same cost as User's pre-save hook (12).
// Login compares against it when no account matches, so an unknown email takes as
// long as a wrong password - otherwise the ~300ms bcrypt gap reveals which work
// emails have accounts, despite both answering with the same 401 message.
// Precomputed so serverless cold starts don't pay for an extra hash.
const DUMMY_PASSWORD_HASH = '$2a$12$04rn5RhrOjvtBbMus6pbsusW5bEN57K/cwze1pFdx4xd2lLt2STv2';

/**
 * @desc    Register a new user
 * @route   POST /api/auth/register
 * @access  Super Admin, Admin, or HR
 */
exports.register = async (req, res, next) => {
  try {
    const { name, email, password, department, designation } = req.body;
    const role = req.body.role || 'employee';

    if (role !== 'employee' && role !== 'finance') {
      return ApiResponse.error(res, 'Only employee or finance roles may be registered', null, 400);
    }
    if (role === 'finance' && !['superadmin', 'admin'].includes(req.user.role)) {
      return ApiResponse.error(res, 'Only admin or superadmin may assign the finance role', null, 403);
    }

    // Validate presence
    if (
      typeof name !== 'string' ||
      !name.trim() ||
      name.trim().length > 120 ||
      typeof email !== 'string' ||
      !validator.isEmail(email.trim()) ||
      typeof password !== 'string' ||
      password.length < 6 ||
      password.length > 72
    ) {
      return ApiResponse.error(
        res,
        'Please provide a valid work email and a password between 6 and 72 characters',
        null,
        400
      );
    }

    // Check if user already exists
    const normalizedEmail = email.toLowerCase().trim();
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return ApiResponse.error(
        res,
        'An account with this corporate email already exists',
        null,
        409
      );
    }

    // Create user (name encrypted, password hashed in pre-save hook)
    const user = await User.create({
      name,
      email: normalizedEmail,
      password,
      role,
      department: department || 'General',
      designation: designation || 'Team Member',
    });
    recordAudit({
      req,
      action: 'CREATE',
      resource: 'User',
      resourceId: user._id,
      meta: { source: 'admin_registration', changedFields: ['name', 'email', 'department', 'designation', 'role'] },
    });

    return ApiResponse.success(
      res,
      'User registered successfully',
      {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          department: user.department,
          designation: user.designation,
          avatar: user.avatar,
        },
      },
      201
    );
  } catch (err) {
    next(err);
  }
};

/**
 * @desc    Login user with work email and password
 * @route   POST /api/auth/login
 * @access  Public
 */
exports.login = async (req, res, next) => {
  try {
    // "username" is accepted as an alias for the work email
    const { password } = req.body;
    const identifier = req.body.email || req.body.username;

    // Validate input
    const errors = [];
    if (typeof identifier !== 'string' || !identifier.trim()) {
      errors.push({ field: 'username', message: 'Username (work email) is required' });
    } else if (!validator.isEmail(identifier.trim())) {
      errors.push({ field: 'username', message: 'Username must be a valid work email address' });
    }
    if (typeof password !== 'string' || !password) {
      errors.push({ field: 'password', message: 'Password is required' });
    } else if (password.length < 6 || password.length > 72) {
      errors.push({ field: 'password', message: 'Password must be between 6 and 72 characters' });
    }
    if (errors.length) {
      return ApiResponse.error(res, 'Validation failed', errors, 400);
    }

    // Check for user and explicitly include password field
    const user = await User.findOne({ email: identifier.toLowerCase().trim() }).select('+password');

    if (!user) {
      await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
      return ApiResponse.error(
        res,
        'Invalid corporate email or password',
        null,
        401
      );
    }

    // Check if password matches
    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      recordAudit({
        req,
        actor: user,
        action: 'LOGIN',
        resource: 'User',
        resourceId: user._id,
        meta: { outcome: 'failure', reason: 'invalid_credentials' },
      });
      return ApiResponse.error(
        res,
        'Invalid corporate email or password',
        null,
        401
      );
    }

    // Check active status
    if (!user.isActive) {
      recordAudit({
        req,
        actor: user,
        action: 'LOGIN',
        resource: 'User',
        resourceId: user._id,
        meta: { outcome: 'failure', reason: 'inactive_account' },
      });
      return ApiResponse.error(
        res,
        'Your account has been deactivated. Please contact your Super Admin.',
        null,
        403
      );
    }

    // Update last login timestamp
    user.lastLogin = Date.now();
    await user.save({ validateBeforeSave: false });
    recordAudit({
      req,
      actor: user,
      action: 'LOGIN',
      resource: 'User',
      resourceId: user._id,
      meta: { outcome: 'success' },
    });

    // Generate JWT token
    const token = user.getSignedJwtToken();

    return ApiResponse.success(res, 'Login successful', {
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department,
        designation: user.designation,
        avatar: user.avatar,
        lastLogin: user.lastLogin,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * @desc    Forgot Password - request reset link
 * @route   POST /api/auth/forgot-password
 * @access  Public
 */
exports.forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    const genericMessage = 'If an account exists with that corporate email, a password reset link has been dispatched.';

    if (typeof email !== 'string' || !validator.isEmail(email.trim())) {
      return ApiResponse.error(res, 'Please provide a valid work email address', null, 400);
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });

    if (!user) {
      return ApiResponse.success(res, genericMessage);
    }

    const resetBaseUrl = resolveResetBaseUrl(process.env, `${req.protocol}://${req.get('host')}`);

    if (!isEmailConfigured() || !resetBaseUrl) {
      console.error('[Email] Password reset unavailable because email or frontend URL configuration is missing.');
      return ApiResponse.success(res, genericMessage);
    }

    const resetToken = user.getResetPasswordToken();
    await user.save({ validateBeforeSave: false });
    const resetUrl = `${resetBaseUrl}/reset-password.html?token=${resetToken}`;

    try {
      await sendResetPasswordEmail(user.email, resetUrl);
    } catch {
      user.resetPasswordToken = undefined;
      user.resetPasswordExpire = undefined;
      await user.save({ validateBeforeSave: false });
      console.error('[Email] Password reset email delivery failed.');
      return ApiResponse.success(res, genericMessage);
    }

    recordAudit({
      req,
      actor: user,
      action: 'PASSWORD_RESET',
      resource: 'User',
      resourceId: user._id,
      meta: { flow: 'reset_requested' },
    });

    return ApiResponse.success(res, genericMessage);
  } catch (err) {
    next(err);
  }
};

/**
 * @desc    Reset Password using token
 * @route   PUT /api/auth/reset-password/:resetToken
 * @access  Public
 */
exports.resetPassword = async (req, res, next) => {
  try {
    const { password } = req.body;
    const resetToken = req.params.resetToken || req.body.resetToken || req.body.token;

    if (!resetToken || typeof resetToken !== 'string') {
      return ApiResponse.error(res, 'A valid password reset token is required', null, 400);
    }
    if (typeof password !== 'string' || password.length < 6 || password.length > 72) {
      return ApiResponse.error(
        res,
        'Please provide a new password between 6 and 72 characters',
        null,
        400
      );
    }

    // Get hashed token
    const hashed = hashToken(resetToken);

    const user = await User.findOne({
      resetPasswordToken: hashed,
      resetPasswordExpire: { $gt: Date.now() },
    });

    if (!user) {
      return ApiResponse.error(
        res,
        'Invalid or expired password reset token',
        null,
        400
      );
    }

    // Set new password and clear reset fields
    user.password = password;
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();
    recordAudit({
      req,
      actor: user,
      action: 'PASSWORD_RESET',
      resource: 'User',
      resourceId: user._id,
      meta: { flow: 'reset_completed' },
    });

    // Auto-login with new token
    const token = user.getSignedJwtToken();

    return ApiResponse.success(res, 'Password reset successful. You are now logged in.', {
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * @desc    Get currently logged-in user profile
 * @route   GET /api/auth/me
 * @access  Private (Protected by JWT)
 */
exports.getMe = async (req, res, next) => {
  try {
    // req.user is set by authMiddleware
    return ApiResponse.success(res, 'Profile retrieved successfully', {
      user: {
        id: req.user._id,
        name: req.user.name,
        email: req.user.email,
        role: req.user.role,
        department: req.user.department,
        designation: req.user.designation,
        avatar: req.user.avatar,
        isActive: req.user.isActive,
        createdAt: req.user.createdAt,
      },
    });
  } catch (err) {
    next(err);
  }
};
