const mongoose = require('mongoose');

const KpiSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    target: { type: Number, required: true },
    actual: { type: Number, default: null },
    unit: { type: String, trim: true, maxlength: 40, default: '' },
    weight: { type: Number, min: 0, max: 100, default: 0 },
  },
  { _id: false }
);

const GoalSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 1000, default: '' },
    status: {
      type: String,
      enum: ['not_started', 'in_progress', 'completed'],
      default: 'not_started',
    },
    kpis: { type: [KpiSchema], default: [] },
  },
  { _id: false }
);

const ReviewSchema = new mongoose.Schema(
  {
    cycle: { type: mongoose.Schema.Types.ObjectId, ref: 'PerformanceCycle', required: true },
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    selfReview: { type: String, required: true, trim: true, maxlength: 5000 },
    managerReview: { type: String, trim: true, maxlength: 5000, default: '' },
    managerRating: {
      type: Number,
      min: 1,
      max: 5,
      validate: (value) => value === null || Number.isInteger(value),
      default: null,
    },
    rating: { type: Number, required: true, min: 1, max: 5, validate: Number.isInteger },
    goals: {
      type: [GoalSchema],
      default: [],
      validate: { validator: (goals) => goals.length <= 20, message: 'A review can contain at most 20 goals' },
    },
  },
  { timestamps: true }
);

ReviewSchema.index({ cycle: 1, employee: 1 }, { unique: true });

module.exports = mongoose.model('Review', ReviewSchema);