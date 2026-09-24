const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const {
  clockIn,
  clockOut,
  getMyAttendance,
} = require('../controllers/attendanceController');

const router = express.Router();

router.use(protect);

router.post('/clock-in', clockIn);
router.post('/clock-out', clockOut);
router.get('/me', getMyAttendance);

module.exports = router;
