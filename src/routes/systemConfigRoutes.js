const express = require('express');
const { protect, authorize } = require('../middleware/authMiddleware');
const systemConfigController = require('../controllers/systemConfigController');

const router = express.Router();

router.use(protect);
router.get('/', systemConfigController.getSystemConfig);
router.put('/', authorize('superadmin'), systemConfigController.putSystemConfig);

module.exports = router;
