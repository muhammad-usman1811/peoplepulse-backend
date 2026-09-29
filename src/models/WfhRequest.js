const mongoose = require('mongoose');

const WfhRequestSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    reason: { type: String, trim: true, maxlength: 500, default: '' },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
      index: true,
    },
    approver: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    decisionNote: { type: String, trim: true, maxlength: 500, default: '' },
    decidedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

WfhRequestSchema.index({ employee: 1, createdAt: -1 });
WfhRequestSchema.index({ approver: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('WfhRequest', WfhRequestSchema);