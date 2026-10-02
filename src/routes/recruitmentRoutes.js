const express = require('express');
const { protect, authorize } = require('../middleware/authMiddleware');
const recruitmentController = require('../controllers/recruitmentController');

const router = express.Router();
router.use(protect, authorize('superadmin', 'admin', 'hr'));

router.post('/job-postings', recruitmentController.createJobPosting);
router.post('/candidates', recruitmentController.createCandidate);
router.patch('/candidates/:candidateId/stage', recruitmentController.moveCandidateStage);

module.exports = router;