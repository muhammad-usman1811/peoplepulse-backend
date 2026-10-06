const mongoose = require('mongoose');

const EmployeeDocumentSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    category: { type: String, required: true, trim: true, maxlength: 50 },
    originalName: { type: String, required: true, trim: true, maxlength: 255 },
    mimeType: { type: String, required: true, enum: ['application/pdf', 'image/jpeg', 'image/png'] },
    size: { type: Number, required: true, min: 1, max: 5 * 1024 * 1024 },
    fileData: { type: Buffer, required: true, select: false },
  },
  { timestamps: true }
);

EmployeeDocumentSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('EmployeeDocument', EmployeeDocumentSchema);
