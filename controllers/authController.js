const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { sendResetPasswordEmail } = require('../src/utils/sendEmail');
const generateTempPassword = require('../utils/generateTempPassword');

const TEMP_PASSWORD_TTL_MS = 30 * 60 * 1000; // 30 minutes

/**
 * @desc    Register a new user
 * @route   POST /api/auth/register
 * @access  Public
 */
const register = async (req, res) => {
  try {
    // NOTE: `role` is intentionally NOT read from req.body here.
    // Accepting a client-supplied role let anyone self-register as
    // 'admin'/'hr'/'manager' (privilege escalation). Every public
    // self-registration is forced to 'employee'; role upgrades should
    // only happen through a trusted/admin-only flow.
    const { name, email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email and password.',
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long.',
      });
    }

    const formattedEmail = email.trim().toLowerCase();

    // Check if user already exists
    const existingUser = await User.findOne({ email: formattedEmail });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'A user with this email already exists.',
      });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create user
    const newUser = await User.create({
      name: name ? name.trim() : '',
      email: formattedEmail,
      password: hashedPassword,
      role: 'employee',
    });

    return res.status(201).json({
      success: true,
      message: 'User registered successfully.',
      user: {
        id: newUser._id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
      },
    });
  } catch (error) {
    console.error('Error in register controller:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error during registration.',
      error: error.message,
    });
  }
};

/**
 * @desc    Login user & authenticate
 * @route   POST /api/auth/login
 * @access  Public
 */
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email and password.',
      });
    }

    const formattedEmail = email.trim().toLowerCase();

    // Find user
    const user = await User.findOne({ email: formattedEmail });
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    // Compare password
    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    // If the current password is a temporary one issued via forgot-password
    // and it has expired, block login even though the hash still matches.
    if (user.tempPasswordExpires && user.tempPasswordExpires.getTime() < Date.now()) {
      return res.status(401).json({
        success: false,
        message: 'Your temporary password has expired. Please request a new one via Forgot Password.',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Login successful.',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('Error in login controller:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error during login.',
      error: error.message,
    });
  }
};

/**
 * @desc    Forgot Password - Reset password to temporary password and send email
 * @route   POST /api/auth/forgot-password
 * @access  Public
 */
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    // Validate email presence
    if (!email || typeof email !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address.',
      });
    }

    // 1. Trim and convert email to lowercase
    const formattedEmail = email.trim().toLowerCase();

    // 2. Search existing User collection in MongoDB
    const user = await User.findOne({ email: formattedEmail });

    // 3. If email does not exist: return error
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User with this email does not exist in database.',
      });
    }

    // Check if email credentials are configured in .env
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      console.warn('[EMAIL WARNING] EMAIL_USER or EMAIL_PASS is missing in .env');
      return res.status(500).json({
        success: false,
        message: 'Email service is not configured yet. Please configure EMAIL_USER and EMAIL_PASS (Gmail App Password) in the .env file so the email can be delivered to the user inbox.',
      });
    }

    // 4. Generate a cryptographically secure random temporary password
    // (previously Math.random().toString(36).slice(-8), which is not
    // secure and could sometimes be shorter than 8 characters).
    const tempPassword = generateTempPassword(10);

    // Hash temporary password using bcryptjs
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(tempPassword, salt);

    // 5. Send email to user's Gmail inbox
    try {
      await sendResetPasswordEmail(formattedEmail, tempPassword);
      console.log(`[EMAIL SUCCESS] Reset email successfully delivered to ${formattedEmail}`);
    } catch (emailError) {
      console.error('Error sending reset email:', emailError.message);
      return res.status(500).json({
        success: false,
        message: 'Failed to send email to Gmail inbox. Please check your EMAIL_USER and Gmail App Password in .env.',
      });
    }

    // Update password field, mark it as a temporary password with an
    // expiry (30 min) so it can't be used forever if never changed, and save.
    user.password = hashedPassword;
    user.tempPasswordExpires = new Date(Date.now() + TEMP_PASSWORD_TTL_MS);
    await user.save();

    // 6. Return clean success response (Password is ONLY sent via email, never shown on screen)
    return res.status(200).json({
      success: true,
      message: 'Password reset successfully. A temporary password has been sent to your email address.',
    });
  } catch (error) {
    console.error('Error in forgotPassword controller:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while processing forgot password request.',
      error: error.message,
    });
  }
};

/**
 * @desc    Change password (set user's new custom password)
 * @route   POST /api/auth/change-password
 * @access  Public
 */
const changePassword = async (req, res) => {
  try {
    const { email, currentPassword, newPassword } = req.body;

    if (!email || !currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email, current/temporary password, and new password.',
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 6 characters long.',
      });
    }

    const formattedEmail = email.trim().toLowerCase();

    // 1. Find user in database
    const user = await User.findOne({ email: formattedEmail });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User with this email does not exist.',
      });
    }

    // 2. Verify current or temporary password
    const isMatch = await user.matchPassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Current/temporary password is incorrect.',
      });
    }

    // 3. Hash new custom password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // 4. Update and save (clear the temp-password expiry — this is now a
    // regular, user-chosen password again)
    user.password = hashedPassword;
    user.tempPasswordExpires = null;
    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Password updated successfully! You can now log in with your new password.',
    });
  } catch (error) {
    console.error('Error in changePassword controller:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while changing password.',
      error: error.message,
    });
  }
};

module.exports = {
  register,
  login,
  forgotPassword,
  changePassword,
};
