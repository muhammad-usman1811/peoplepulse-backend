const { v4: uuidv4 } = require('uuid');
const mongoose = require('mongoose');
const { z } = require('zod');
const Document = require('../models/HrDocument');
const Upload = require('../models/HrUpload');
const storage = require('../config/hrStorage');
const categories = ['policy', 'announcement', 'form'];
const types = { pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
const fileSchema = z.object({
  originalName: z.string().trim().min(1).max(200).refine(n => !/[\\/]/.test(n) && !n.includes('..'), 'Invalid filename'),
  mimeType: z.enum([types.pdf, types.docx]),
  size: z.number().int().positive().max(10485760),
  category: z.enum(categories),
}).refine(b => types[b.originalName.split('.').pop().toLowerCase()] === b.mimeType,
  'Filename extension must match the PDF or DOCX MIME type');
const pathSchema = z.string().regex(/^(policy|announcement|form)\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}-[a-z0-9._-]+\.(pdf|docx)$/);
const fail = (res, status, message) => res.status(status).json({ message });
const wrap = fn => async (req, res, next) => {
  res.set('Cache-Control', 'private, no-store');
  try { await fn(req, res); } catch (err) {
    if (err instanceof z.ZodError) return fail(res, 400, err.issues.map(i => i.message).join('; '));
    if (err.code === 11000) return fail(res, 400, 'This file path is already saved');
    next(err);
  }
};
async function find(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) { fail(res, 404, 'Document not found'); return null; }
  const doc = await Document.findById(req.params.id).select('+filePath');
  if (!doc) fail(res, 404, 'Document not found');
  return doc;
}
exports.uploadUrl = wrap(async (req, res) => {
  const b = fileSchema.parse(req.body);
  const safeName = b.originalName.toLowerCase().replace(/\s/g, '-').replace(/[^a-z0-9._-]/g, '');
  const filePath = b.category + '/' + uuidv4() + '-' + safeName;
  const { data, error } = await storage().createSignedUploadUrl(filePath);
  if (error) throw error;
  await Upload.create({ ...b, filePath, uploadedBy: req.user._id, expiresAt: new Date(Date.now() + 86400000) });
  res.json({ path: filePath, token: data.token, url: data.signedUrl });
});
exports.create = wrap(async (req, res) => {
  const b = z.object({ title: z.string().trim().min(1).max(200), category: z.enum(categories), filePath: pathSchema }).parse(req.body);
  if (!b.filePath.startsWith(b.category + '/')) return fail(res, 400, 'Path category must match category');
  const upload = await Upload.findOne({ filePath: b.filePath, uploadedBy: req.user._id, expiresAt: { $gt: new Date() } });
  if (!upload) return fail(res, 400, 'Path was not issued to this user or has expired');
  const { data, error } = await storage().info(b.filePath);
  if (error) {
    if ([400, 404].includes(Number(error.statusCode || error.status))) return fail(res, 400, 'File not found in storage');
    throw error;
  }
  if (!data) return fail(res, 400, 'File not found in storage');
  const metadata = data.metadata || {};
  const size = Number(metadata.size ?? data.size);
  const mimeType = metadata.mimetype ?? data.contentType;
  fileSchema.parse({ originalName: upload.originalName, category: b.category, size, mimeType });
  if (size !== upload.size || mimeType !== upload.mimeType) return fail(res, 400, 'Stored file does not match the upload request');
  const doc = await Document.create({ ...b, originalName: upload.originalName, size, mimeType, uploadedBy: req.user._id });
  const result = doc.toObject();
  delete result.filePath;
  res.status(201).json(result);
});
exports.list = wrap(async (req, res) => {
  const category = z.enum(categories).optional().parse(req.query.category);
  const docs = await Document.find(category ? { category } : {}).sort({ createdAt: -1 })
    .select('title category originalName mimeType size createdAt').lean();
  res.json(docs.map(({ _id, ...doc }) => ({ id: String(_id), ...doc })));
});
const link = preview => wrap(async (req, res) => {
  const doc = await find(req, res);
  if (!doc) return;
  if (preview && doc.mimeType !== types.pdf) return fail(res, 400, 'DOCX preview is unavailable; download the file instead');
  const { data, error } = await storage().createSignedUrl(doc.filePath, 60, preview ? {} : { download: doc.originalName });
  if (error) throw error;
  res.json({ url: data.signedUrl, expiresIn: 60 });
});
exports.preview = link(true);
exports.download = link(false);
exports.remove = wrap(async (req, res) => {
  const doc = await find(req, res);
  if (!doc) return;
  const { error } = await storage().remove([doc.filePath]);
  if (error) throw error;
  await Document.deleteOne({ _id: doc._id });
  res.status(200).json({ message: 'Document deleted successfully' });
});
