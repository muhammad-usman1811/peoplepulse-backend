const express = require('express');
const { protect, authorize } = require('../middleware/authMiddleware');
const performanceController = require('../controllers/performanceController');

const router = express.Router();

router.use(protect);
router.post('/cycles', authorize('superadmin', 'admin', 'hr'), performanceController.createCycle);
router.post('/cycles/:cycleId/reviews', performanceController.submitSelfReview);

module.exports = router;