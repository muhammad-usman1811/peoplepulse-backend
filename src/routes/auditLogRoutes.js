const express = require('express');
const { protect, authorize } = require('../middleware/authMiddleware');
const {
  listAuditLogs,
  getAuditLog,
} = require('../controllers/auditLogController');

const router = express.Router();

// Audit records are restricted to the Super Admin.
const superAdminOnly = authorize('superadmin');

router.use(protect, superAdminOnly);

// GET /api/audit-logs           — paginated list with optional filters
// GET /api/audit-logs/:id       — single audit log entry
router.get('/', listAuditLogs);
router.get('/:id', getAuditLog);

module.exports = router;
