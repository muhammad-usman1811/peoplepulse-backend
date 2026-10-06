const express = require('express');
const { protect, authorize } = require('../middleware/authMiddleware');
const recruitmentController = require('../controllers/recruitmentController');

const router = express.Router();
router.use(protect, authorize('superadmin', 'admin', 'hr'));

router.get('/job-postings', recruitmentController.getJobPostings);
router.get('/job-postings/:jobPostingId', recruitmentController.getJobPosting);
router.post('/job-postings', recruitmentController.createJobPosting);
router.get('/candidates', recruitmentController.getCandidates);
router.get('/candidates/:candidateId', recruitmentController.getCandidate);
router.post('/candidates', recruitmentController.createCandidate);
router.patch('/candidates/:candidateId/stage', recruitmentController.moveCandidateStage);
router.post('/candidates/:candidateId/hire', recruitmentController.hireCandidate);
router.get('/candidates/:candidateId/onboarding', recruitmentController.getCandidateOnboarding);

module.exports = router;