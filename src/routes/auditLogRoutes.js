const express = require('express');
const { protect, authorize } = require('../middleware/authMiddleware');
const {
  listAuditLogs,
  getAuditLog,
} = require('../controllers/auditLogController');

const router = express.Router();

// Only superadmin and admin may read the audit trail
const adminOnly = authorize('superadmin', 'admin');

router.use(protect, adminOnly);

// GET /api/audit-log            — paginated list with optional filters
// GET /api/audit-log/:id        — single audit log entry
router.get('/', listAuditLogs);
router.get('/:id', getAuditLog);

module.exports = router;
