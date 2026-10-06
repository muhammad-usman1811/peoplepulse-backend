const express = require('express');
const { protect, authorize } = require('../middleware/authMiddleware');
const {
  getAttendanceSummary,
  getLeaveSummary,
  getPayrollSummary,
  getPerformanceSummary,
} = require('../controllers/reportsController');

const router = express.Router();

router.use(protect, authorize('superadmin', 'admin', 'hr'));
router.get('/attendance-summary', getAttendanceSummary);
router.get('/leave-summary', getLeaveSummary);
router.get('/payroll-summary', getPayrollSummary);
router.get('/performance-summary', getPerformanceSummary);

module.exports = router;