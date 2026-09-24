const express = require('express');
const router = express.Router();
const {
  register,
  login,
  forgotPassword,
  changePassword,
} = require('../controllers/authController');
const { forgotPasswordLimiter } = require('../utils/rateLimiter');

// @route   POST /api/auth/register
// @desc    Register a new user
// @access  Public
router.post('/register', register);

// @route   POST /api/auth/login
// @desc    Authenticate user & login
// @access  Public
router.post('/login', login);

// @route   POST /api/auth/forgot-password
// @desc    Handle forgot password request & dispatch email
// @access  Public
// Rate-limited: max 5 requests / 15 min per IP+email, to stop this endpoint
// being used to spam a user's inbox or repeatedly invalidate their password.
router.post('/forgot-password', forgotPasswordLimiter, forgotPassword);

// @route   POST /api/auth/change-password
// @desc    Change password using temporary or current password
// @access  Public
router.post('/change-password', changePassword);

module.exports = router;
