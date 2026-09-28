const mongoose = require('mongoose');

const PerformanceCycleSchema = new mongoose.Schema(
  {
    period: { type: String, required: true, trim: true, maxlength: 80, unique: true },
    status: { type: String, enum: ['open', 'closed'], default: 'open', index: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('PerformanceCycle', PerformanceCycleSchema);