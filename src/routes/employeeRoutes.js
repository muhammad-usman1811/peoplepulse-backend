const express = require('express');
const { protect, authorize } = require('../middleware/authMiddleware');
const {
  listEmployees,
  getEmployee,
  createEmployee,
  updateEmployee,
  deactivateEmployee,
} = require('../controllers/employeeController');

const router = express.Router();
const manageEmployees = authorize('superadmin', 'admin', 'hr');

router.use(protect);
router.get('/', manageEmployees, listEmployees);
router.get('/:id', manageEmployees, getEmployee);
router.post('/', manageEmployees, createEmployee);
router.put('/:id', manageEmployees, updateEmployee);
router.delete('/:id', manageEmployees, deactivateEmployee);

module.exports = router;
