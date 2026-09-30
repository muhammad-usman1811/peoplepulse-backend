const mongoose = require('mongoose');

const PayslipSchema = new mongoose.Schema(
  {
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    month: {
      type: String,
      required: true,
      match: /^\d{4}-(0[1-9]|1[0-2])$/,
    },
    salaryStructure: {
      id: { type: mongoose.Schema.Types.ObjectId, ref: 'SalaryStructure', required: true },
      grade: { type: String, required: true },
    },
    monthlySalary: { type: Number, required: true, min: 0 },
    basicPay: { type: Number, required: true, min: 0 },
    allowances: [{
      name: { type: String, required: true },
      type: { type: String, enum: ['percentage', 'fixed'], required: true },
      value: { type: Number, required: true },
      amount: { type: Number, required: true, min: 0 },
    }],
    grossPay: { type: Number, required: true, min: 0 },
    deductions: { type: Number, required: true, min: 0, default: 0 },
    netPay: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ['pending', 'approved', 'sent_back'], default: 'pending' },
    decisionNote: { type: String, trim: true, default: '' },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    approvedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

PayslipSchema.index({ employee: 1, month: 1 }, { unique: true });
PayslipSchema.index({ month: 1, status: 1 });

module.exports = mongoose.model('Payslip', PayslipSchema);