const mongoose = require('mongoose');
// A server-issued receipt binds each path to its uploader and original metadata.
const schema = new mongoose.Schema({
  filePath: { type: String, required: true, unique: true },
  originalName: String, mimeType: String, size: Number, category: String,
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  expiresAt: { type: Date, required: true, expires: 0 },
});
module.exports = mongoose.model('HrUpload', schema);
