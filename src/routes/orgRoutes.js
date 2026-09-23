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
router.get('/departments/:id', departments.getById);
router.post('/departments', manageOrg, departments.create);
router.put('/departments/:id', manageOrg, departments.update);
router.delete('/departments/:id', manageOrg, departments.delete);

router.get('/designations', designations.list);
router.get('/designations/:id', designations.getById);
router.post('/designations', manageOrg, designations.create);
router.put('/designations/:id', manageOrg, designations.update);
router.delete('/designations/:id', manageOrg, designations.delete);

router.get('/locations', locations.list);
router.get('/locations/:id', locations.getById);
router.post('/locations', manageOrg, locations.create);
router.put('/locations/:id', manageOrg, locations.update);
router.delete('/locations/:id', manageOrg, locations.delete);

module.exports = router;