const mongoose = require('mongoose');
const recruitmentStages = require('../utils/recruitmentStages');

const CandidateSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
    jobPosting: { type: mongoose.Schema.Types.ObjectId, ref: 'JobPosting', required: true },
    stage: { type: String, enum: recruitmentStages, default: 'Applied' },
  },
  { timestamps: true }
);

CandidateSchema.index({ jobPosting: 1, email: 1 }, { unique: true });

module.exports = mongoose.model('Candidate', CandidateSchema);