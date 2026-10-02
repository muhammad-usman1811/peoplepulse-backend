const express = require('express');
const { protect, authorize } = require('../middleware/authMiddleware');
const performanceController = require('../controllers/performanceController');

const router = express.Router();

router.use(protect);
router.get('/cycles', performanceController.listCycles);
router.post('/cycles', authorize('superadmin', 'admin', 'hr'), performanceController.createCycle);
router.patch('/cycles/:cycleId/close', authorize('superadmin', 'admin', 'hr'), performanceController.closeCycle);
router.get('/cycles/:cycleId/reviews', authorize('superadmin', 'admin', 'hr'), performanceController.listCycleReviews);
router.post('/cycles/:cycleId/reviews', performanceController.submitSelfReview);
router.get('/team', performanceController.listTeamReviews);
router.get('/reviews/my', performanceController.getMyReviews);
router.get('/reviews/:reviewId', performanceController.getReview);
router.put('/reviews/:reviewId/manager-review', performanceController.submitManagerReview);

module.exports = router;