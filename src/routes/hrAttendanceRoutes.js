const express = require('express');
const { protect, authorize } = require('../middleware/authMiddleware');
const { listHrAttendance } = require('../controllers/attendanceController');

const router = express.Router();

router.use(protect);

router.get('/', authorize('hr'), listHrAttendance);

module.exports = router;
