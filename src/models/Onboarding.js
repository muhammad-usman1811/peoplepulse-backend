const mongoose = require('mongoose');

const TaskSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 1000, default: '' },
    category: {
      type: String,
      enum: ['Documentation', 'IT Setup', 'HR Orientation', 'Training', 'General'],
      default: 'General',
    },
    documentRequirement: {
      type: String,
      enum: ['identityDocuments', 'employmentDocuments'],
    },
    status: {
      type: String,
      enum: ['Pending', 'In Progress', 'Completed'],
      default: 'Pending',
    },
    dueDate: { type: Date },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    completedAt: { type: Date },
    completedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    completedByDocument: { type: mongoose.Schema.Types.ObjectId, ref: 'Document' },
  },
  { timestamps: true }
);

const OnboardingSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200, default: 'Onboarding Checklist' },
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    candidate: { type: mongoose.Schema.Types.ObjectId, ref: 'Candidate' },
    hireIdentityEmail: { type: String, trim: true, lowercase: true, select: false },
    status: {
      type: String,
      enum: ['Pending', 'In Progress', 'Completed', 'Cancelled'],
      default: 'Pending',
    },
    tasks: [TaskSchema],
    targetCompletionDate: { type: Date },
    startedAt: { type: Date, default: Date.now },
    completedAt: { type: Date },
  },
  { timestamps: true }
);

OnboardingSchema.index({ employee: 1 });
OnboardingSchema.index({ hireIdentityEmail: 1 }, { sparse: true }); // unique removed: re-hire must be able to create a fresh checklist
// BUG-A FIX: candidate unique index removed for the same reason as hireIdentityEmail.
// Same candidate can be re-hired (Completed cycle → new Pending cycle).
// Uniqueness was causing E11000 in the catch block, leaving onboarding: null
// while the API silently returned 200 "checklist initialized".
OnboardingSchema.index({ candidate: 1 }, { sparse: true }); // unique removed
OnboardingSchema.index({ status: 1 });

module.exports = mongoose.model('Onboarding', OnboardingSchema);
