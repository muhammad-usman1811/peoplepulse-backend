const mongoose = require('mongoose');

const DocumentSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 500, default: '' },
    category: {
      type: String,
      enum: ['Personal', 'Identification', 'Academic', 'Employment', 'Tax', 'Legal', 'Onboarding', 'Other'],
      default: 'Onboarding',
    },
    fileUrl: { type: String, required: true, trim: true },
    fileType: { type: String, trim: true, default: 'application/pdf' },
    fileSize: { type: Number, default: 0 },
    fileContent: { type: Buffer, select: false },
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    candidate: { type: mongoose.Schema.Types.ObjectId, ref: 'Candidate' },
    onboarding: { type: mongoose.Schema.Types.ObjectId, ref: 'Onboarding' },
    status: {
      type: String,
      enum: ['Pending', 'Approved', 'Rejected'],
      default: 'Pending',
    },
    rejectionReason: { type: String, trim: true, default: '' },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    verifiedAt: { type: Date },
  },
  { timestamps: true }
);

DocumentSchema.set('toJSON', {
  transform(_document, result) {
    delete result.fileContent;
    return result;
  },
});

DocumentSchema.set('toObject', {
  transform(_document, result) {
    delete result.fileContent;
    return result;
  },
});

DocumentSchema.index({ employee: 1, category: 1 });
DocumentSchema.index({ candidate: 1 });
DocumentSchema.index({ onboarding: 1 });
DocumentSchema.index({ status: 1 });
DocumentSchema.index({ uploadedBy: 1 });

module.exports = mongoose.model('Document', DocumentSchema);
