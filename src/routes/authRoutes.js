const express = require('express');
const rateLimit = require('express-rate-limit');
const {
  register,
  login,
  forgotPassword,
  resetPassword,
  getMe,
} = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

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

// Routes
router.post('/register', register);
router.post('/login', authLimiter, login);
router.post('/forgot-password', authLimiter, forgotPassword);
router.post('/reset-password', authLimiter, resetPassword);
router.put('/reset-password/:resetToken', authLimiter, resetPassword);
router.get('/me', protect, getMe);

module.exports = router;
