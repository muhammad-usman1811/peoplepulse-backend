const express = require('express');
const { protect, authorize } = require('../middleware/authMiddleware');
const {
  departments,
  designations,
  locations,
} = require('../controllers/orgController');

const router = express.Router();
const manageOrg = authorize('superadmin', 'admin', 'hr');

router.use(protect);

router.get('/departments', departments.list);
router.post('/departments', manageOrg, departments.create);
router.get('/designations', designations.list);
router.post('/designations', manageOrg, designations.create);
router.get('/locations', locations.list);
router.post('/locations', manageOrg, locations.create);

module.exports = router;