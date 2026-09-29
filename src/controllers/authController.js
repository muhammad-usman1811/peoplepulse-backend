const validator = require('validator');
const User = require('../models/User');
const ApiResponse = require('../utils/apiResponse');
const { hashToken } = require('../utils/cryptoUtils');
const { isEmailConfigured, sendResetPasswordEmail } = require('../utils/sendEmail');

/**
 * @desc    Register a new user
 * @route   POST /api/auth/register
 * @access  Super Admin, Admin, or HR
 */
exports.register = async (req, res, next) => {
  try {
    const { name, email, password, department, designation } = req.body;

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
      role: 'employee',
      department: department || 'General',
      designation: designation || 'Team Member',
    });

    const token = user.getSignedJwtToken();

    return ApiResponse.success(
      res,
      'User registered successfully',
      {
        token,
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
      return ApiResponse.error(
        res,
        'Invalid corporate email or password',
        null,
        401
      );
    }

    // Check active status
    if (!user.isActive) {
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

    if (typeof email !== 'string' || !validator.isEmail(email.trim())) {
      return ApiResponse.error(res, 'Please provide a valid work email address', null, 400);
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });

    if (!user) {
      // Return 200/safe message to prevent account enumeration
      return ApiResponse.success(
        res,
        'If an account exists with that corporate email, a password reset link has been dispatched.'
      );
    }

    // Generate reset token
    const resetToken = user.getResetPasswordToken();
    await user.save({ validateBeforeSave: false });

    const frontendUrl = process.env.FRONTEND_URL || process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
    const resetUrl = `${frontendUrl.replace(/\/$/, '')}/reset-password.html?token=${resetToken}`;

    if (isEmailConfigured()) {
      try {
        await sendResetPasswordEmail(user.email, resetUrl);
      } catch (emailError) {
        // Roll back the token so the user isn't left with a dead-end reset
        // link that was never delivered, and let them retry.
        user.resetPasswordToken = undefined;
        user.resetPasswordExpire = undefined;
        await user.save({ validateBeforeSave: false });
        console.error('[Email] Password reset email could not be sent:', emailError.message);
        return ApiResponse.error(res, 'Password reset email could not be sent. Please try again later.', null, 502);
      }
    } else if (process.env.NODE_ENV === 'production') {
      // Never leak the reset token in the response on a real deployment —
      // fail closed instead of falling back to the dev-only behavior below.
      user.resetPasswordToken = undefined;
      user.resetPasswordExpire = undefined;
      await user.save({ validateBeforeSave: false });
      return ApiResponse.error(res, 'Password reset is temporarily unavailable. Please contact an administrator.', null, 503);
    }

    const responseData = { expiresInMinutes: 30 };
    if (process.env.NODE_ENV !== 'production') {
      // Email isn't configured (or NODE_ENV isn't production) — return the
      // link directly so local/dev environments keep working without SMTP.
      responseData.resetUrl = resetUrl;
      responseData.resetToken = resetToken;
    }

    return ApiResponse.success(
      res,
      'Password reset link generated successfully',
      responseData
    );
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
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();

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
