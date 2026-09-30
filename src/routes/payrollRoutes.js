const express = require('express');
const { protect, authorize } = require('../middleware/authMiddleware');
const {
  listSalaryStructures,
  getSalaryStructure,
  createSalaryStructure,
  updateSalaryStructure,
  deleteSalaryStructure,
  generatePayslips,
  approvePayslip,
  sendBackPayslip,
} = require('../controllers/payrollController');

const router = express.Router();

// HR roles manage payroll setup; Finance controls payslip decisions.
const managePayroll = authorize('superadmin', 'admin', 'hr');

router.use(protect);

router.post('/generate', managePayroll, generatePayslips);
router.patch('/payslips/:id/approve', authorize('finance'), approvePayslip);
router.patch('/payslips/:id/send-back', authorize('finance'), sendBackPayslip);

// Salary Structure CRUD
// GET    /api/payroll/salary-structure          — list all grades
// POST   /api/payroll/salary-structure          — create a new grade
// GET    /api/payroll/salary-structure/:id      — get one grade by id
// PUT    /api/payroll/salary-structure/:id      — update a grade
// DELETE /api/payroll/salary-structure/:id      — delete a grade
router
  .route('/salary-structure')
  .get(managePayroll, listSalaryStructures)
  .post(managePayroll, createSalaryStructure);

router
  .route('/salary-structure/:id')
  .get(managePayroll, getSalaryStructure)
  .put(managePayroll, updateSalaryStructure)
  .delete(managePayroll, deleteSalaryStructure);

module.exports = router;
