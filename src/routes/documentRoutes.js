const express = require('express');
const { protect, authorize } = require('../middleware/authMiddleware');
const documentController = require('../controllers/documentController');

const router = express.Router();

router.use(protect);

router.post('/upload', express.raw({ type: 'application/octet-stream', limit: '4mb' }), documentController.uploadDocument);
router.post('/', documentController.createDocument);
router.get('/', documentController.getDocuments);
router.get('/my-documents', documentController.getMyDocuments);
router.get('/:id/file', documentController.downloadDocument);
router.get('/:id', documentController.getDocumentById);
router.patch('/:id/status', authorize('superadmin', 'admin', 'hr'), documentController.updateDocumentStatus);
router.delete('/:id', documentController.deleteDocument);

module.exports = router;
