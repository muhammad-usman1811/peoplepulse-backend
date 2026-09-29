const mongoose = require('mongoose');

const ReviewSchema = new mongoose.Schema(
  {
    cycle: { type: mongoose.Schema.Types.ObjectId, ref: 'PerformanceCycle', required: true },
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    selfReview: { type: String, required: true, trim: true, maxlength: 5000 },
    managerReview: { type: String, trim: true, maxlength: 5000, default: '' },
    rating: { type: Number, required: true, min: 1, max: 5, validate: Number.isInteger },
  },
  { timestamps: true }
);

ReviewSchema.index({ cycle: 1, employee: 1 }, { unique: true });

module.exports = mongoose.model('Review', ReviewSchema);