const express = require('express');
const rateLimit = require('express-rate-limit');
const {
  register,
  login,
  forgotPassword,
  resetPassword,
  getMe,
} = require('../controllers/authController');
const { protect, authorize } = require('../middleware/authMiddleware');
const { forgotPasswordLimiter } = require('../utils/rateLimiter');

const router = express.Router();

// Rate limiter for authentication attempts (15 minutes window, max 20 requests per IP)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: {
    success: false,
    message: 'Too many login/password reset attempts from this IP, please try again after 15 minutes',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const forgotPasswordIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: {
    success: false,
    message: 'If an account exists with that corporate email, a password reset link has been dispatched.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const resetPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: {
    success: false,
    message: 'Too many password reset attempts from this IP, please try again after 15 minutes',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Routes
router.post('/register', protect, authorize('superadmin', 'admin', 'hr'), register);
router.post('/login', authLimiter, login);
router.post('/forgot-password', forgotPasswordIpLimiter, forgotPasswordLimiter, forgotPassword);
router.post('/reset-password', resetPasswordLimiter, resetPassword);
router.put('/reset-password/:resetToken', resetPasswordLimiter, resetPassword);
router.get('/me', protect, getMe);

module.exports = router;
