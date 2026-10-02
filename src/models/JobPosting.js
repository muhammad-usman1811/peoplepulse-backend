const mongoose = require('mongoose');

const JobPostingSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 150 },
    department: { type: String, required: true, trim: true, maxlength: 120 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('JobPosting', JobPostingSchema);