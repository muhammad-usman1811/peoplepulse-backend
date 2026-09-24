const express = require('express');
const rateLimit = require('express-rate-limit');
const { protect } = require('../middleware/authMiddleware');
const {
  getProfile,
  updateProfile,
  changePassword,
  getNotifications,
  updateNotifications,
} = require('../controllers/profileController');

const router = express.Router();

const passwordChangeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: {
    success: false,
    message: 'Too many password change attempts from this IP, please try again after 15 minutes',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

router.use(protect);
router.get('/', getProfile);
router.put('/', updateProfile);
router.put('/password', passwordChangeLimiter, changePassword);
router.get('/notifications', getNotifications);
router.put('/notifications', updateNotifications);

module.exports = router;