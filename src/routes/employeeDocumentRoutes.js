const express = require('express');
const { protect, authorize } = require('../middleware/authMiddleware');
// Renamed from documentController/documentRoutes during the merge: the
// onboarding-integration intern's Document API owns /api/documents, so this
// upload-only EmployeeDocument API is mounted at /api/employee-documents.
const documentController = require('../controllers/employeeDocumentController');

const router = express.Router();

router.use(protect);
router.post('/upload', documentController.uploadMiddleware, documentController.uploadDocument);
router.get('/me', documentController.listMyDocuments);
router.get('/employee/:employeeId', authorize('superadmin', 'admin', 'hr'), documentController.listEmployeeDocuments);
router.delete('/:id', documentController.deleteDocument);

module.exports = router;
