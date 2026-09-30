const express = require('express');
const { protect, authorize } = require('../middleware/authMiddleware');
const performanceController = require('../controllers/performanceController');

const router = express.Router();

router.use(protect);
router.post('/cycles', authorize('superadmin', 'admin', 'hr'), performanceController.createCycle);
router.post('/cycles/:cycleId/reviews', performanceController.submitSelfReview);
router.get('/team/reviews', performanceController.listTeamReviews);
router.get('/team', performanceController.listTeamReviews);
router.get('/reviews/:reviewId', performanceController.getReview);
router.put('/reviews/:reviewId/manager-review', performanceController.submitManagerReview);
router.post('/reviews/:reviewId/manager-review', performanceController.submitManagerReview);
router.put('/reviews/:reviewId', performanceController.submitManagerReview);

module.exports = router;