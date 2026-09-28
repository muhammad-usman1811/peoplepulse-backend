const express = require('express');
const { protect, authorize } = require('../middleware/authMiddleware');
const {
  listSalaryStructures,
  getSalaryStructure,
  createSalaryStructure,
  updateSalaryStructure,
  deleteSalaryStructure,
} = require('../controllers/payrollController');

const router = express.Router();

// Only HR roles and above may manage payroll data
const managePayroll = authorize('superadmin', 'admin', 'hr');

router.use(protect, managePayroll);

// Salary Structure CRUD
// GET    /api/payroll/salary-structure          — list all grades
// POST   /api/payroll/salary-structure          — create a new grade
// GET    /api/payroll/salary-structure/:id      — get one grade by id
// PUT    /api/payroll/salary-structure/:id      — update a grade
// DELETE /api/payroll/salary-structure/:id      — delete a grade
router
  .route('/salary-structure')
  .get(listSalaryStructures)
  .post(createSalaryStructure);

router
  .route('/salary-structure/:id')
  .get(getSalaryStructure)
  .put(updateSalaryStructure)
  .delete(deleteSalaryStructure);

module.exports = router;
