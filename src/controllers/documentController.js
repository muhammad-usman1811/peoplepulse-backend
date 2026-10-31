const mongoose = require('mongoose');
const { inflateRawSync } = require('node:zlib');
const Document = require('../models/Document');
const User = require('../models/User');
const Candidate = require('../models/Candidate');
const Onboarding = require('../models/Onboarding');
const ApiResponse = require('../utils/apiResponse');
const recordAudit = require('../utils/recordAudit');
const notify = require('../utils/notify');
const { parsePositiveInteger } = require('../utils/pagination');

const validCategories = ['Personal', 'Identification', 'Academic', 'Employment', 'Tax', 'Legal', 'Onboarding', 'Other'];
const validStatuses = ['Pending', 'Approved', 'Rejected'];
const MAX_FILE_SIZE_BYTES = 4 * 1024 * 1024;
const MAX_USER_STORAGE_BYTES = Number(process.env.DOCUMENT_USER_STORAGE_QUOTA_BYTES || 50 * 1024 * 1024);
const MAX_TOTAL_STORAGE_BYTES = Number(process.env.DOCUMENT_TOTAL_STORAGE_QUOTA_BYTES || 1024 * 1024 * 1024);
const documentCategoriesByRequirement = {
  identityDocuments: ['Identification', 'Personal', 'Academic'],
  employmentDocuments: ['Employment', 'Tax'],
};

const detectFileType = (content) => {
  if (content.subarray(0, 5).toString() === '%PDF-') return 'application/pdf';
  if (content.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return 'image/jpeg';
  if (content.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  if (content.subarray(0, 4).toString() === 'RIFF' && content.subarray(8, 12).toString() === 'WEBP') {
    return 'image/webp';
  }
  if (content.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))
    && content.includes(Buffer.from('WordDocument'))) {
    return 'application/msword';
  }
  if (isValidDocx(content)) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  return null;
};

const isValidDocx = (content) => {
  const eocdSignature = 0x06054b50;
  const centralDirectorySignature = 0x02014b50;
  const localFileSignature = 0x04034b50;
  const searchStart = Math.max(0, content.length - 65557);
  let eocdOffset = -1;

  for (let offset = content.length - 22; offset >= searchStart; offset -= 1) {
    if (content.readUInt32LE(offset) === eocdSignature) {
      eocdOffset = offset;
      break;
    }
  }
  if (eocdOffset < 0 || eocdOffset + 22 > content.length) return false;

  if (
    content.readUInt16LE(eocdOffset + 4) !== 0
    || content.readUInt16LE(eocdOffset + 6) !== 0
    || content.readUInt16LE(eocdOffset + 8) !== content.readUInt16LE(eocdOffset + 10)
  ) return false;
  const entryCount = content.readUInt16LE(eocdOffset + 10);
  let cursor = content.readUInt32LE(eocdOffset + 16);
  const directoryEnd = cursor + content.readUInt32LE(eocdOffset + 12);
  if (entryCount === 0xffff || directoryEnd > eocdOffset) return false;
  const entries = new Map();
  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > content.length || content.readUInt32LE(cursor) !== centralDirectorySignature) return false;
    const flags = content.readUInt16LE(cursor + 8);
    const compression = content.readUInt16LE(cursor + 10);
    const compressedSize = content.readUInt32LE(cursor + 20);
    const uncompressedSize = content.readUInt32LE(cursor + 24);
    const nameLength = content.readUInt16LE(cursor + 28);
    const extraLength = content.readUInt16LE(cursor + 30);
    const commentLength = content.readUInt16LE(cursor + 32);
    const localOffset = content.readUInt32LE(cursor + 42);
    const nameStart = cursor + 46;
    if (flags & 1 || nameStart + nameLength + extraLength + commentLength > directoryEnd) return false;
    const name = content.subarray(nameStart, nameStart + nameLength).toString('utf8');
    if (['[Content_Types].xml', '_rels/.rels', 'word/document.xml'].includes(name)) {
      entries.set(name, { compression, compressedSize, uncompressedSize, localOffset, name });
    }
    cursor = nameStart + nameLength + extraLength + commentLength;
  }
  if (cursor !== directoryEnd) return false;

  const readEntry = (entry) => {
    if (entry.uncompressedSize > 10 * 1024 * 1024 || entry.localOffset + 30 > content.length) return null;
    if (content.readUInt32LE(entry.localOffset) !== localFileSignature) return null;
    const localNameLength = content.readUInt16LE(entry.localOffset + 26);
    const localExtraLength = content.readUInt16LE(entry.localOffset + 28);
    const localNameStart = entry.localOffset + 30;
    const localNameEnd = localNameStart + localNameLength;
    if (localNameEnd > content.length || content.subarray(localNameStart, localNameEnd).toString('utf8') !== entry.name) {
      return null;
    }
    const dataStart = localNameEnd + localExtraLength;
    const dataEnd = dataStart + entry.compressedSize;
    if (dataEnd > content.length) return null;
    const compressed = content.subarray(dataStart, dataEnd);
    const output = entry.compression === 0
      ? compressed
      : entry.compression === 8
        ? inflateRawSync(compressed, { maxOutputLength: 10 * 1024 * 1024 })
        : null;
    return output && output.length === entry.uncompressedSize ? output.toString('utf8') : null;
  };

  try {
    const contentTypes = entries.get('[Content_Types].xml');
    const relationships = entries.get('_rels/.rels');
    const documentXml = entries.get('word/document.xml');
    if (!contentTypes || !relationships || !documentXml) return false;
    const contentTypesXml = readEntry(contentTypes);
    const relationshipsXml = readEntry(relationships);
    const documentText = readEntry(documentXml);
    return Boolean(
      contentTypesXml
      && /application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document\.main\+xml/.test(contentTypesXml)
      && relationshipsXml
      && /officeDocument/.test(relationshipsXml)
      && documentText
      && /<w:document(?:\s|>)/.test(documentText)
    );
  } catch {
    return false;
  }
};

const getDocumentRequirement = (task) => {
  if (task.documentRequirement) return task.documentRequirement;
  if (task.title === 'Upload Identification & Personal Documents') return 'identityDocuments';
  if (task.title === 'Sign Employment Contract & Tax Forms') return 'employmentDocuments';
  return null;
};

const hasApprovedDocumentCategories = async (document, requirement, targetStatus) => {
  const requiredCategories = documentCategoriesByRequirement[requirement];
  if (!requiredCategories) return false;
  const scope = document.onboarding
    ? { onboarding: document.onboarding }
    : document.employee
      ? { employee: document.employee }
      : document.candidate
        ? { candidate: document.candidate }
        : null;
  if (!scope) return false;

  for (const category of requiredCategories) {
    const currentDocumentSatisfies = targetStatus === 'Approved' && document.category === category;
    if (!currentDocumentSatisfies && !await Document.exists({
      _id: { $ne: document._id },
      status: 'Approved',
      category,
      ...scope,
    })) {
      return false;
    }
  }
  return true;
};

const getStoredBytes = async (match = {}) => {
  const [result] = await Document.aggregate([
    { $match: match },
    { $group: { _id: null, bytes: { $sum: '$fileSize' } } },
  ]);
  return result ? result.bytes : 0;
};

const findOnboardingForDocument = async (document) => {
  if (document.onboarding) return Onboarding.findById(document.onboarding);
  if (document.candidate) {
    const candidate = await Candidate.findById(document.candidate);
    if (candidate && candidate.onboarding) return Onboarding.findById(candidate.onboarding);
  }
  if (!document.employee) return null;
  const query = Onboarding.findOne({ employee: document.employee });
  return query.sort ? query.sort({ createdAt: -1 }) : query;
};

exports.createDocument = async (req, res, next) => {
  try {
    return ApiResponse.error(res, 'Upload the actual file bytes using POST /documents/upload; fileUrl, fileType and fileSize are not trusted', null, 400);
  } catch (err) {
    next(err);
  }
};

exports.uploadDocument = async (req, res, next) => {
  try {
    const { title, description, category, employee, candidate, onboarding } = req.query;
    const documentTitle = typeof title === 'string' ? title.trim() : '';
    if (!documentTitle || documentTitle.length > 200) {
      return ApiResponse.error(res, 'title is required and cannot exceed 200 characters', null, 400);
    }
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      return ApiResponse.error(res, 'Request body must contain the file bytes', null, 400);
    }
    if (req.body.length > MAX_FILE_SIZE_BYTES) {
      return ApiResponse.error(res, 'File size must not exceed 4MB', null, 413);
    }

    const fileType = detectFileType(req.body);
    if (!fileType) {
      return ApiResponse.error(res, 'File must be a valid PDF, JPEG, PNG, WebP, DOC, or DOCX document', null, 415);
    }

    const isHrOrAdmin = ['superadmin', 'admin', 'hr'].includes(req.user.role);
    const targetEmployee = isHrOrAdmin ? employee : req.user._id;
    const targetCandidate = isHrOrAdmin ? candidate : undefined;
    if (category && !validCategories.includes(category)) {
      return ApiResponse.error(res, `category must be one of: ${validCategories.join(', ')}`, null, 400);
    }
    if (targetEmployee && !mongoose.isValidObjectId(targetEmployee)) {
      return ApiResponse.error(res, 'employee must be a valid User ID', null, 400);
    }
    if (targetCandidate && !mongoose.isValidObjectId(targetCandidate)) {
      return ApiResponse.error(res, 'candidate must be a valid Candidate ID', null, 400);
    }
    if (onboarding && !mongoose.isValidObjectId(onboarding)) {
      return ApiResponse.error(res, 'onboarding must be a valid Onboarding ID', null, 400);
    }
    if (targetEmployee && !(await User.exists({ _id: targetEmployee }))) {
      return ApiResponse.error(res, 'Employee user not found', null, 404);
    }
    if (targetCandidate && !(await Candidate.exists({ _id: targetCandidate }))) {
      return ApiResponse.error(res, 'Candidate not found', null, 404);
    }

    let targetOnboarding = onboarding;
    let onboardingDoc;
    if (targetCandidate && !targetOnboarding) {
      const candidateRecord = await Candidate.findById(targetCandidate);
      targetOnboarding = candidateRecord && candidateRecord.onboarding;
    }
    if (targetOnboarding) {
      onboardingDoc = await Onboarding.findById(targetOnboarding);
      if (!onboardingDoc) return ApiResponse.error(res, 'Onboarding checklist not found', null, 404);
      if (!isHrOrAdmin && (!onboardingDoc.employee || String(onboardingDoc.employee) !== String(req.user._id))) {
        return ApiResponse.error(res, 'Onboarding checklist does not belong to user', null, 403);
      }
      if (targetEmployee && onboardingDoc.employee && String(targetEmployee) !== String(onboardingDoc.employee)) {
        return ApiResponse.error(res, 'Onboarding checklist does not belong to employee', null, 400);
      }
      if (targetCandidate && onboardingDoc.candidate && String(targetCandidate) !== String(onboardingDoc.candidate)) {
        return ApiResponse.error(res, 'Onboarding checklist does not belong to candidate', null, 400);
      }
    }
    const documentEmployee = targetEmployee || (onboardingDoc && onboardingDoc.employee);
    const documentCandidate = targetCandidate || (onboardingDoc && onboardingDoc.candidate);
    if (!documentEmployee && !documentCandidate && !targetOnboarding) {
      return ApiResponse.error(res, 'A document must be linked to an employee, candidate, or onboarding checklist', null, 400);
    }
    if (
      !Number.isSafeInteger(MAX_USER_STORAGE_BYTES)
      || MAX_USER_STORAGE_BYTES <= 0
      || !Number.isSafeInteger(MAX_TOTAL_STORAGE_BYTES)
      || MAX_TOTAL_STORAGE_BYTES <= 0
    ) {
      throw new Error('Document storage quota environment values must be positive safe integers');
    }

    const [userStoredBytes, totalStoredBytes] = await Promise.all([
      getStoredBytes({ uploadedBy: req.user._id }),
      getStoredBytes(),
    ]);
    if (userStoredBytes + req.body.length > MAX_USER_STORAGE_BYTES) {
      return ApiResponse.error(res, 'Your document storage quota has been reached', null, 413);
    }
    if (totalStoredBytes + req.body.length > MAX_TOTAL_STORAGE_BYTES) {
      return ApiResponse.error(res, 'Document storage capacity has been reached; contact an administrator', null, 507);
    }

    const documentId = new mongoose.Types.ObjectId();
    const document = await Document.create({
      _id: documentId,
      title: documentTitle,
      description: typeof description === 'string' ? description.trim() : '',
      category: category || 'Onboarding',
      fileUrl: `${req.baseUrl}/${documentId}/file`,
      fileType,
      fileSize: req.body.length,
      fileContent: req.body,
      employee: documentEmployee || undefined,
      candidate: documentCandidate || undefined,
      onboarding: targetOnboarding || undefined,
      uploadedBy: req.user._id,
      status: 'Pending',
    });

    recordAudit({
      req,
      action: 'CREATE',
      resource: 'Document',
      resourceId: document._id,
      meta: { title: document.title, category: document.category, employee: targetEmployee, candidate: targetCandidate },
    });

    return ApiResponse.success(res, 'Document uploaded successfully', { document }, 201);
  } catch (err) {
    next(err);
  }
};

exports.downloadDocument = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return ApiResponse.error(res, 'Document not found', null, 404);
    }

    const document = await Document.findById(req.params.id).select('+fileContent');
    if (!document) return ApiResponse.error(res, 'Document not found', null, 404);
    const isHrOrAdmin = ['superadmin', 'admin', 'hr'].includes(req.user.role);
    const isOwner = document.employee && String(document.employee) === String(req.user._id);
    const isUploader = document.uploadedBy && String(document.uploadedBy) === String(req.user._id);
    if (!isHrOrAdmin && !isOwner && !isUploader) {
      return ApiResponse.error(res, 'Not authorized to download this document', null, 403);
    }
    if (!document.fileContent) {
      return ApiResponse.error(res, 'Document file is unavailable', null, 404);
    }

    res.set('Content-Type', document.fileType);
    res.set('Content-Length', String(document.fileSize));
    res.set('Content-Disposition', 'attachment');
    res.set('Cache-Control', 'private, no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    return res.send(document.fileContent);
  } catch (err) {
    next(err);
  }
};

exports.getDocuments = async (req, res, next) => {
  try {
    const page = parsePositiveInteger(req.query.page, 1);
    const limit = parsePositiveInteger(req.query.limit, 10, 100);
    if (page === null || limit === null) {
      return ApiResponse.error(res, 'page must be a positive integer and limit must be an integer between 1 and 100', null, 400);
    }

    const filter = {};
    const isHrOrAdmin = ['superadmin', 'admin', 'hr'].includes(req.user.role);

    if (!isHrOrAdmin) {
      filter.$or = [
        { employee: req.user._id },
        { uploadedBy: req.user._id },
      ];
    } else {
      if (req.query.employee) {
        if (!mongoose.isValidObjectId(req.query.employee)) {
          return ApiResponse.error(res, 'employee must be a valid User ID', null, 400);
        }
        filter.employee = req.query.employee;
      }
      if (req.query.candidate) {
        if (!mongoose.isValidObjectId(req.query.candidate)) {
          return ApiResponse.error(res, 'candidate must be a valid Candidate ID', null, 400);
        }
        filter.candidate = req.query.candidate;
      }
    }

    if (req.query.category) {
      if (!validCategories.includes(req.query.category)) {
        return ApiResponse.error(res, `category must be one of: ${validCategories.join(', ')}`, null, 400);
      }
      filter.category = req.query.category;
    }

    if (req.query.status) {
      if (!validStatuses.includes(req.query.status)) {
        return ApiResponse.error(res, `status must be one of: ${validStatuses.join(', ')}`, null, 400);
      }
      filter.status = req.query.status;
    }

    if (req.query.onboarding) {
      if (!mongoose.isValidObjectId(req.query.onboarding)) {
        return ApiResponse.error(res, 'onboarding must be a valid Onboarding ID', null, 400);
      }
      filter.onboarding = req.query.onboarding;
    }

    const [total, documents] = await Promise.all([
      Document.countDocuments(filter),
      Document.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('employee', 'name email employeeId department designation')
        .populate('candidate', 'name email stage')
        .populate('uploadedBy', 'name email role')
        .populate('verifiedBy', 'name email role'),
    ]);

    return ApiResponse.success(res, 'Documents retrieved successfully', {
      documents,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
};

exports.getMyDocuments = async (req, res, next) => {
  try {
    const page = parsePositiveInteger(req.query.page, 1);
    const limit = parsePositiveInteger(req.query.limit, 10, 100);
    if (page === null || limit === null) {
      return ApiResponse.error(res, 'page must be a positive integer and limit must be an integer between 1 and 100', null, 400);
    }

    const filter = {
      $or: [
        { employee: req.user._id },
        { uploadedBy: req.user._id },
      ],
    };

    const [total, documents] = await Promise.all([
      Document.countDocuments(filter),
      Document.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('uploadedBy', 'name email role')
        .populate('verifiedBy', 'name email role'),
    ]);

    return ApiResponse.success(res, 'My documents retrieved successfully', {
      documents,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
};

exports.getDocumentById = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return ApiResponse.error(res, 'Document not found', null, 404);
    }

    const document = await Document.findById(req.params.id)
      .populate('employee', 'name email employeeId department designation')
      .populate('candidate', 'name email stage')
      .populate('uploadedBy', 'name email role')
      .populate('verifiedBy', 'name email role');

    if (!document) return ApiResponse.error(res, 'Document not found', null, 404);

    const isHrOrAdmin = ['superadmin', 'admin', 'hr'].includes(req.user.role);
    const isOwner = document.employee && String(document.employee._id || document.employee) === String(req.user._id);
    const isUploader = document.uploadedBy && String(document.uploadedBy._id || document.uploadedBy) === String(req.user._id);

    if (!isHrOrAdmin && !isOwner && !isUploader) {
      return ApiResponse.error(res, 'Not authorized to view this document', null, 403);
    }

    return ApiResponse.success(res, 'Document retrieved successfully', { document });
  } catch (err) {
    next(err);
  }
};

exports.updateDocumentStatus = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return ApiResponse.error(res, 'Document not found', null, 404);
    }

    const { status, rejectionReason } = req.body;

    if (!validStatuses.includes(status) || status === 'Pending') {
      return ApiResponse.error(res, 'status must be Approved or Rejected', null, 400);
    }

    if (status === 'Rejected' && (!rejectionReason || typeof rejectionReason !== 'string' || !rejectionReason.trim())) {
      return ApiResponse.error(res, 'rejectionReason is required when status is Rejected', null, 400);
    }

    const document = await Document.findById(req.params.id);
    if (!document) return ApiResponse.error(res, 'Document not found', null, 404);
    const isHrOrAdmin = ['superadmin', 'admin', 'hr'].includes(req.user.role);
    const mayApproveOwnCandidateUpload = isHrOrAdmin && document.candidate && !document.employee;
    if (document.uploadedBy && String(document.uploadedBy) === String(req.user._id) && !mayApproveOwnCandidateUpload) {
      return ApiResponse.error(res, 'You cannot approve or reject a document you uploaded', null, 403);
    }
    if (status === 'Approved' && document.status === 'Approved') {
      return ApiResponse.error(res, 'Document is already approved', null, 409);
    }

    const wasApproved = document.status === 'Approved';
    document.status = status;
    document.verifiedBy = req.user._id;
    document.verifiedAt = new Date();
    document.rejectionReason = status === 'Rejected' ? rejectionReason.trim() : '';

    const documentRequirement = Object.entries(documentCategoriesByRequirement)
      .find(([, categories]) => categories.includes(document.category))?.[0];
    let onboarding;
    let onboardingSnapshot;

    if (
      documentRequirement
      && (status === 'Approved' || (status === 'Rejected' && wasApproved))
    ) {
      onboarding = await findOnboardingForDocument(document);
      const matchingTasks = onboarding && onboarding.status !== 'Cancelled'
        ? onboarding.tasks.filter(
            (task) => task.category === 'Documentation' && getDocumentRequirement(task) === documentRequirement
          )
        : [];
      if (onboarding) {
        onboardingSnapshot = {
          status: onboarding.status,
          completedAt: onboarding.completedAt,
          tasks: onboarding.tasks.map((task) => ({
            task,
            status: task.status,
            completedAt: task.completedAt,
            completedBy: task.completedBy,
            completedByDocument: task.completedByDocument,
          })),
        };
      }
      let onboardingChanged = false;

      for (const task of matchingTasks) {
        const requirementSatisfied = await hasApprovedDocumentCategories(document, documentRequirement, status);
        if (status === 'Approved' && requirementSatisfied && task.status !== 'Completed') {
          task.status = 'Completed';
          task.completedAt = new Date();
          task.completedBy = req.user._id;
          task.completedByDocument = document._id;
          onboardingChanged = true;
        } else if (
          status === 'Rejected'
          && !requirementSatisfied
          && task.completedByDocument
        ) {
          task.status = 'Pending';
          task.completedAt = undefined;
          task.completedBy = undefined;
          task.completedByDocument = undefined;
          onboardingChanged = true;
        }
      }

      if (!onboardingChanged) onboardingSnapshot = null;
      if (onboarding && onboardingChanged) {
        if (onboarding.status !== 'Cancelled') {
          const allCompleted = onboarding.tasks.length > 0
            && onboarding.tasks.every((task) => task.status === 'Completed');
          const allPending = onboarding.tasks.every((task) => task.status === 'Pending');
          onboarding.status = allCompleted ? 'Completed' : allPending ? 'Pending' : 'In Progress';
          onboarding.completedAt = allCompleted ? onboarding.completedAt || new Date() : undefined;
        }
        await onboarding.save();
      }
    }

    try {
      await document.save();
    } catch (saveError) {
      if (onboardingSnapshot) {
        onboarding.status = onboardingSnapshot.status;
        onboarding.completedAt = onboardingSnapshot.completedAt;
        for (const snapshot of onboardingSnapshot.tasks) {
          snapshot.task.status = snapshot.status;
          snapshot.task.completedAt = snapshot.completedAt;
          snapshot.task.completedBy = snapshot.completedBy;
          snapshot.task.completedByDocument = snapshot.completedByDocument;
        }
        try {
          await onboarding.save();
        } catch (rollbackError) {
          throw new AggregateError([saveError, rollbackError], 'Document save and onboarding rollback both failed');
        }
      }
      throw saveError;
    }

    recordAudit({
      req,
      action: status === 'Approved' ? 'APPROVE' : 'REJECT',
      resource: 'Document',
      resourceId: document._id,
      meta: { title: document.title, status: document.status, rejectionReason: document.rejectionReason },
    });

    let notificationRecipient = document.employee;
    if (!notificationRecipient && onboarding && onboarding.employee) {
      notificationRecipient = onboarding.employee;
    }
    if (!notificationRecipient) notificationRecipient = document.uploadedBy;
    if (notificationRecipient) {
      const title = status === 'Approved' ? 'Document Approved' : 'Document Rejected';
      const body = status === 'Approved'
        ? `Your document "${document.title}" has been approved by HR.`
        : `Your document "${document.title}" was rejected: ${document.rejectionReason}`;
      notify(notificationRecipient, 'SYSTEM', title, body).catch((err) =>
        console.error('[Notification Error]:', err.message)
      );
    }

    return ApiResponse.success(res, `Document ${status.toLowerCase()} successfully`, { document });
  } catch (err) {
    next(err);
  }
};

exports.deleteDocument = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return ApiResponse.error(res, 'Document not found', null, 404);
    }

    const document = await Document.findById(req.params.id);
    if (!document) return ApiResponse.error(res, 'Document not found', null, 404);

    const isHrOrAdmin = ['superadmin', 'admin', 'hr'].includes(req.user.role);
    const isUploader = document.uploadedBy && String(document.uploadedBy) === String(req.user._id);

    if (!isHrOrAdmin && (!isUploader || document.status !== 'Pending')) {
      return ApiResponse.error(res, 'Not authorized to delete this document', null, 403);
    }

    await Document.findByIdAndDelete(req.params.id);

    recordAudit({
      req,
      action: 'DELETE',
      resource: 'Document',
      resourceId: req.params.id,
      meta: { title: document.title },
    });

    return ApiResponse.success(res, 'Document deleted successfully', { id: req.params.id });
  } catch (err) {
    next(err);
  }
};
