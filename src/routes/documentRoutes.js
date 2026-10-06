const express = require('express');
const { protect, authorize } = require('../middleware/authMiddleware');
const documentController = require('../controllers/documentController');

const router = express.Router();

router.use(protect);
router.post('/upload', documentController.uploadMiddleware, documentController.uploadDocument);
router.get('/me', documentController.listMyDocuments);
router.get('/employee/:employeeId', authorize('superadmin', 'admin', 'hr'), documentController.listEmployeeDocuments);
router.delete('/:id', documentController.deleteDocument);

module.exports = router;
