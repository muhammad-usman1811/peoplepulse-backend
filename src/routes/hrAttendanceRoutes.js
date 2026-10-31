const express = require('express');
const { protect, authorize } = require('../middleware/authMiddleware');
const validateQuery = require('../middleware/validateQuery');
const { attendanceExportQuerySchema } = require('../validators/attendanceValidators');
const { listHrAttendance, exportHrAttendance } = require('../controllers/attendanceController');

const router = express.Router();

router.use(protect);

// Registered before '/' and any future '/:id' route so it is never shadowed.
// Order: protect (401) -> authorize (403) -> validateQuery (400) -> controller.
router.get(
  '/export',
  authorize('hr', 'admin'),
  validateQuery(attendanceExportQuerySchema),
  exportHrAttendance
);
router.get('/', authorize('hr'), listHrAttendance);

module.exports = router;
