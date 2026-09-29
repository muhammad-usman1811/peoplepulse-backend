const mongoose = require('mongoose');

const AllowanceSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Allowance name is required'],
      trim: true,
    },
    type: {
      type: String,
      enum: ['percentage', 'fixed'],
      default: 'percentage',
    },
    value: {
      type: Number,
      required: [true, 'Allowance value is required'],
      min: [0, 'Allowance value cannot be negative'],
    },
  },
  { _id: false }
);

const SalaryStructureSchema = new mongoose.Schema(
  {
    grade: {
      type: String,
      required: [true, 'Grade is required'],
      unique: true,
      trim: true,
    },
    basicPercentage: {
      type: Number,
      required: [true, 'Basic percentage is required'],
      min: [0, 'Basic percentage cannot be negative'],
      max: [100, 'Basic percentage cannot exceed 100'],
    },
    allowances: {
      type: [AllowanceSchema],
      default: [],
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('SalaryStructure', SalaryStructureSchema);
