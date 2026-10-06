const express = require('express');
const { protect, authorize } = require('../middleware/authMiddleware');
const onboardingController = require('../controllers/onboardingController');

const router = express.Router();

router.use(protect);

router.get('/my-onboarding', onboardingController.getMyOnboarding);
router.get('/:id', onboardingController.getOnboardingById);
router.patch('/:id/tasks/:taskId', onboardingController.updateTask);

// HR / Admin routes
router.post('/', authorize('superadmin', 'admin', 'hr'), onboardingController.createOnboarding);
router.get('/', authorize('superadmin', 'admin', 'hr'), onboardingController.getOnboardingList);
router.patch('/:id', authorize('superadmin', 'admin', 'hr'), onboardingController.updateOnboarding);
router.delete('/:id', authorize('superadmin', 'admin', 'hr'), onboardingController.deleteOnboarding);
router.post('/:id/tasks', authorize('superadmin', 'admin', 'hr'), onboardingController.addTask);
router.delete('/:id/tasks/:taskId', authorize('superadmin', 'admin', 'hr'), onboardingController.deleteTask);
router.post('/trigger-from-candidate/:candidateId', authorize('superadmin', 'admin', 'hr'), onboardingController.triggerCandidateOnboarding);

module.exports = router;
