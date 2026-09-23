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

// A valid JWT alone shouldn't allow unlimited guesses at the current password
const passwordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: {
    success: false,
    message: 'Too many password change attempts, please try again after 15 minutes',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

router.use(protect);
router.get('/', getProfile);
router.put('/', updateProfile);
router.put('/password', passwordLimiter, changePassword);
router.get('/notifications', getNotifications);
router.put('/notifications', updateNotifications);

module.exports = router;