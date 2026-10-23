const express = require('express');
const { protect, authorize } = require('../middleware/authMiddleware');
const {
  clockIn,
  clockOut,
  getMyAttendance,
  getTeamAttendance,
  getAttendance,
} = require('../controllers/attendanceController');

const router = express.Router();

router.use(protect);

router.post('/clock-in', clockIn);
router.post('/clock-out', clockOut);
router.get('/me', getMyAttendance);
router.get('/team', getTeamAttendance);
router.get('/', authorize('hr'), getAttendance);

module.exports = router;
