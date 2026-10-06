const multer = require('multer');
const path = require('path');
const mongoose = require('mongoose');
const EmployeeDocument = require('../models/EmployeeDocument');
const User = require('../models/User');
const ApiResponse = require('../utils/apiResponse');
const recordAudit = require('../utils/recordAudit');

const maxFileSize = 5 * 1024 * 1024;
const mimeExtensions = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png',
};

const uploadFile = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxFileSize, files: 1, fields: 1, fieldSize: 100 },
}).single('file');

const matchesFileType = (file) => {
  const extension = path.extname(file.originalname).toLowerCase();
  if (extension !== mimeExtensions[file.mimetype]) return false;
  if (file.mimetype === 'application/pdf') return file.buffer.subarray(0, 5).toString() === '%PDF-';
  if (file.mimetype === 'image/png') {
    return file.buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  }
  return file.mimetype === 'image/jpeg'
    && file.buffer.length >= 3
    && file.buffer[0] === 0xff
    && file.buffer[1] === 0xd8
    && file.buffer[2] === 0xff;
};

exports.uploadMiddleware = (req, res, next) => {
  uploadFile(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
      return ApiResponse.error(res, err.code === 'LIMIT_FILE_SIZE'
        ? 'File must not exceed 5 MB'
        : 'Upload must contain one file and one category field', null, status);
    }
    if (err) return next(err);
    return next();
  });
};

exports.uploadDocument = async (req, res, next) => {
  try {
    if (typeof req.body.category !== 'string' || !/^[\w -]{1,50}$/.test(req.body.category.trim())) {
      return ApiResponse.error(res, 'category is required and must be 1-50 letters, numbers, spaces, underscores, or hyphens', null, 400);
    }
    if (!req.file) return ApiResponse.error(res, 'A file is required', null, 400);
    if (!req.file.originalname || req.file.originalname.length > 255) {
      return ApiResponse.error(res, 'File name must be 1-255 characters', null, 400);
    }
    if (!matchesFileType(req.file)) {
      return ApiResponse.error(res, 'Only valid PDF, JPEG, and PNG files are accepted', null, 400);
    }

    const document = await EmployeeDocument.create({
      userId: req.user._id,
      category: req.body.category.trim(),
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
      fileData: req.file.buffer,
    });
    recordAudit({
      req,
      action: 'CREATE',
      resource: 'EmployeeDocument',
      resourceId: document._id,
      meta: { category: document.category, originalName: document.originalName },
    });
    return ApiResponse.success(res, 'Document uploaded successfully', {
      document: {
        id: document._id,
        category: document.category,
        originalName: document.originalName,
        mimeType: document.mimeType,
        size: document.size,
        createdAt: document.createdAt,
      },
    }, 201);
  } catch (err) {
    next(err);
  }
};

exports.listMyDocuments = async (req, res, next) => {
  try {
    const documents = await EmployeeDocument.find({ userId: req.user._id })
      .select('-fileData')
      .sort({ createdAt: -1 });
    return ApiResponse.success(res, 'Documents retrieved successfully', { documents });
  } catch (err) {
    next(err);
  }
};

exports.listEmployeeDocuments = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.employeeId)) {
      return ApiResponse.error(res, 'Invalid employee ID', null, 400);
    }

    const employee = await User.findOne({ _id: req.params.employeeId, role: 'employee' })
      .select('_id')
      .lean();
    if (!employee) return ApiResponse.error(res, 'Employee not found', null, 404);

    const documents = await EmployeeDocument.find({ userId: employee._id })
      .select('-fileData')
      .sort({ createdAt: -1 });
    return ApiResponse.success(res, 'Employee documents retrieved successfully', { documents });
  } catch (err) {
    next(err);
  }
};

exports.deleteDocument = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return ApiResponse.error(res, 'Invalid document ID', null, 400);
    }

    const canManageDocuments = ['superadmin', 'admin', 'hr'].includes(req.user.role);
    const filter = canManageDocuments
      ? { _id: req.params.id }
      : { _id: req.params.id, userId: req.user._id };
    const document = await EmployeeDocument.findOneAndDelete(filter);
    if (!document) return ApiResponse.error(res, 'Document not found', null, 404);

    recordAudit({
      req,
      action: 'DELETE',
      resource: 'EmployeeDocument',
      resourceId: document._id,
      meta: { category: document.category, originalName: document.originalName },
    });
    return ApiResponse.success(res, 'Document deleted successfully', {
      document: {
        id: document._id,
        category: document.category,
        originalName: document.originalName,
      },
    });
  } catch (err) {
    next(err);
  }
};
