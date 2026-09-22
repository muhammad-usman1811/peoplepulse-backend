const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const {
  getProfile,
  updateProfile,
  changePassword,
  getNotifications,
  updateNotifications,
} = require('../controllers/profileController');

const router = express.Router();

router.use(protect);
router.get('/', getProfile);
router.put('/', updateProfile);
router.put('/password', changePassword);
router.get('/notifications', getNotifications);
router.put('/notifications', updateNotifications);

module.exports = router;