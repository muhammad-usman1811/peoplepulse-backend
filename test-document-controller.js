const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { deflateRawSync } = require('node:zlib');
const Document = require('./src/models/Document');
const User = require('./src/models/User');
const Notification = require('./src/models/Notification');
const Onboarding = require('./src/models/Onboarding');
const Candidate = require('./src/models/Candidate');
const controller = require('./src/controllers/documentController');
const documentRoutes = require('./src/routes/documentRoutes');
const errorHandler = require('./src/middleware/errorMiddleware');
const swaggerDocument = require('./src/config/swagger');
const postmanCollection = require('./PeoplePulse_Onboarding_Documents_API.postman_collection.json');

const makeZip = (files) => {
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;
  for (const [name, content] of Object.entries(files)) {
    const nameBytes = Buffer.from(name);
    const fileBytes = Buffer.from(content);
    const compressed = deflateRawSync(fileBytes);
    const local = Buffer.alloc(30 + nameBytes.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(fileBytes.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    nameBytes.copy(local, 30);
    localParts.push(local, compressed);

    const central = Buffer.alloc(46 + nameBytes.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(fileBytes.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(localOffset, 42);
    nameBytes.copy(central, 46);
    centralParts.push(central);
    localOffset += local.length + compressed.length;
  }
  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localOffset, 16);
  return Buffer.concat([...localParts, centralDirectory, end]);
};

const originalMethods = {
  documentCreate: Document.create,
  documentFind: Document.find,
  documentFindById: Document.findById,
  documentCountDocuments: Document.countDocuments,
  documentFindByIdAndDelete: Document.findByIdAndDelete,
  documentFindOne: Document.findOne,
  documentUpdateMany: Document.updateMany,
  documentExists: Document.exists,
  documentAggregate: Document.aggregate,
  candidateFindById: Candidate.findById,
  userExists: User.exists,
  notificationCreate: Notification.create,
  onboardingFindOne: Onboarding.findOne,
  onboardingFindById: Onboarding.findById,
};

const createResponse = () => ({
  statusCode: 200,
  body: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  },
});

const runController = async (handler, req) => {
  const res = createResponse();
  let nextError;
  await handler(req, res, (error) => { nextError = error; });
  if (nextError) throw nextError;
  return res;
};

test.afterEach(() => {
  Document.create = originalMethods.documentCreate;
  Document.find = originalMethods.documentFind;
  Document.findById = originalMethods.documentFindById;
  Document.countDocuments = originalMethods.documentCountDocuments;
  Document.findByIdAndDelete = originalMethods.documentFindByIdAndDelete;
  Document.findOne = originalMethods.documentFindOne;
  Document.updateMany = originalMethods.documentUpdateMany;
  Document.exists = originalMethods.documentExists;
  Document.aggregate = originalMethods.documentAggregate;
  Candidate.findById = originalMethods.candidateFindById;
  User.exists = originalMethods.userExists;
  Notification.create = originalMethods.notificationCreate;
  Onboarding.findOne = originalMethods.onboardingFindOne;
  Onboarding.findById = originalMethods.onboardingFindById;
});

test.beforeEach(() => {
  Document.exists = async () => false;
  Document.aggregate = async () => [];
  Candidate.findById = async () => null;
});

test('document creation rejects unverified client-supplied file metadata', async () => {
  const res = await runController(controller.createDocument, {
    body: {
      title: 'CNIC',
      fileUrl: 'https://storage.example.test/cnic.pdf',
      fileType: 'application/pdf',
      fileSize: 10,
    },
    user: { _id: new mongoose.Types.ObjectId(), role: 'employee' },
  });
  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /actual file bytes/);
});

test('document upload detects MIME and byte size from the actual file payload', async () => {
  const userId = new mongoose.Types.ObjectId();
  User.exists = async () => true;
  let createdData;
  Document.create = async (data) => {
    createdData = data;
    return { _id: new mongoose.Types.ObjectId(), ...data, save: async function () { return this; } };
  };

  const content = Buffer.from('%PDF-1.7\n');
  const res = await runController(controller.uploadDocument, {
    query: { title: 'National Identity Card', category: 'Identification' },
    body: content,
    baseUrl: '/api/documents',
    user: { _id: userId, role: 'employee' },
  });

  assert.equal(res.statusCode, 201);
  assert.equal(createdData.title, 'National Identity Card');
  assert.equal(createdData.category, 'Identification');
  assert.equal(String(createdData.uploadedBy), String(userId));
  assert.equal(createdData.status, 'Pending');
  assert.equal(createdData.fileType, 'application/pdf');
  assert.equal(createdData.fileSize, content.length);
  assert(createdData.fileContent.equals(content));
});

test('document upload rejects requests without an employee, candidate, or checklist target', async () => {
  const res = await runController(controller.uploadDocument, {
    query: { title: 'Unlinked file' },
    body: Buffer.from('%PDF-1.7\n'),
    user: { _id: new mongoose.Types.ObjectId(), role: 'hr' },
  });
  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /must be linked to an employee, candidate, or onboarding/i);
});

test('candidate document upload links the candidate and can notify the HR uploader after approval', async () => {
  const hrId = new mongoose.Types.ObjectId();
  const candidateId = new mongoose.Types.ObjectId();
  let createdDocument;
  let notification;
  Candidate.exists = async () => true;
  Candidate.findById = async () => ({ _id: candidateId, onboarding: null });
  Document.create = async (data) => {
    createdDocument = { _id: new mongoose.Types.ObjectId(), ...data, save: async function () { return this; } };
    return createdDocument;
  };
  Document.findById = async () => createdDocument;
  Notification.create = async (data) => { notification = data; return data; };

  const upload = await runController(controller.uploadDocument, {
    query: { title: 'Candidate ID', candidate: candidateId.toString(), category: 'Identification' },
    body: Buffer.from('%PDF-1.7\n'),
    baseUrl: '/api/documents',
    user: { _id: hrId, role: 'hr' },
  });
  assert.equal(upload.statusCode, 201);
  assert.equal(String(createdDocument.candidate), String(candidateId));
  assert.equal(createdDocument.employee, undefined);

  const approved = await runController(controller.updateDocumentStatus, {
    params: { id: createdDocument._id.toString() },
    body: { status: 'Approved' },
    user: { _id: hrId, role: 'hr' },
  });
  assert.equal(approved.statusCode, 200);
  assert.equal(String(notification.userId), String(hrId));
  assert.match(notification.body, /approved by HR/);
});

test('document upload rejects payloads whose signatures do not match supported files', async () => {
  let createCalled = false;
  Document.create = async () => { createCalled = true; };
  const res = await runController(controller.uploadDocument, {
    query: { title: 'Spoofed file', fileType: 'application/pdf', fileSize: 5 },
    body: Buffer.from('not a pdf'),
    user: { _id: new mongoose.Types.ObjectId(), role: 'employee' },
  });

  assert.equal(res.statusCode, 415);
  assert.equal(createCalled, false);
});

test('legacy DOC is accepted from its OLE and WordDocument signatures', async () => {
  const userId = new mongoose.Types.ObjectId();
  User.exists = async () => true;
  let createdData;
  Document.create = async (data) => {
    createdData = data;
    return { _id: new mongoose.Types.ObjectId(), ...data };
  };
  const content = Buffer.concat([
    Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
    Buffer.from('WordDocument'),
  ]);
  const res = await runController(controller.uploadDocument, {
    query: { title: 'Legacy Word document' },
    body: content,
    user: { _id: userId, role: 'employee' },
  });
  assert.equal(res.statusCode, 201);
  assert.equal(createdData.fileType, 'application/msword');
});

test('a ZIP containing the DOCX path as plain text is not treated as a DOCX file', async () => {
  let createCalled = false;
  Document.create = async () => { createCalled = true; };
  const res = await runController(controller.uploadDocument, {
    query: { title: 'Fake Word file' },
    body: Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x03, 0x04]),
      Buffer.from('word/document.xml'),
    ]),
    user: { _id: new mongoose.Types.ObjectId(), role: 'employee' },
  });
  assert.equal(res.statusCode, 415);
  assert.equal(createCalled, false);
});

test('a DOCX is accepted only when its package parts and XML signatures are valid', async () => {
  const userId = new mongoose.Types.ObjectId();
  User.exists = async () => true;
  let createdData;
  Document.create = async (data) => {
    createdData = data;
    return { _id: new mongoose.Types.ObjectId(), ...data };
  };
  const content = makeZip({
    '[Content_Types].xml': '<Types><Override ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    '_rels/.rels': '<Relationships><Relationship Type="officeDocument"/></Relationships>',
    'word/document.xml': '<w:document xmlns:w="urn:word"><w:body/></w:document>',
  });
  const res = await runController(controller.uploadDocument, {
    query: { title: 'Valid Word document' },
    body: content,
    user: { _id: userId, role: 'employee' },
  });
  assert.equal(res.statusCode, 201);
  assert.equal(createdData.fileType, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
});
test('getDocuments returns list filtered by status and category', async () => {
  Document.countDocuments = async () => 1;
  Document.find = () => ({
    sort: () => ({
      skip: () => ({
        limit: () => ({
          populate: () => ({
            populate: () => ({
              populate: () => ({
                populate: async () => [{ _id: new mongoose.Types.ObjectId(), title: 'Doc 1' }],
              }),
            }),
          }),
        }),
      }),
    }),
  });

  const res = await runController(controller.getDocuments, {
    query: { page: '1', limit: '10', category: 'Identification', status: 'Pending' },
    user: { _id: new mongoose.Types.ObjectId(), role: 'hr' },
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.documents.length, 1);
});

test('updateDocumentStatus approves document and sets verifier details', async () => {
  const docId = new mongoose.Types.ObjectId();
  const hrId = new mongoose.Types.ObjectId();
  const employeeId = new mongoose.Types.ObjectId();

  const mockDoc = {
    _id: docId,
    title: 'CNIC Copy',
    status: 'Pending',
    employee: employeeId,
    save: async function () { return this; },
  };
  Document.findById = async () => mockDoc;
  Notification.create = async () => ({});
  Onboarding.findOne = async () => null;

  const res = await runController(controller.updateDocumentStatus, {
    params: { id: docId.toString() },
    body: { status: 'Approved' },
    user: { _id: hrId, role: 'hr' },
  });

  assert.equal(res.statusCode, 200);
  assert.equal(mockDoc.status, 'Approved');
  assert.equal(String(mockDoc.verifiedBy), String(hrId));
  assert(mockDoc.verifiedAt);
});

test('uploader cannot approve own document', async () => {
  const uploaderId = new mongoose.Types.ObjectId();
  let saveCalled = false;
  Document.findById = async () => ({
    _id: new mongoose.Types.ObjectId(),
    status: 'Pending',
    uploadedBy: uploaderId,
    save: async function () { saveCalled = true; },
  });
  const res = await runController(controller.updateDocumentStatus, {
    params: { id: new mongoose.Types.ObjectId().toString() },
    body: { status: 'Approved' },
    user: { _id: uploaderId, role: 'hr' },
  });
  assert.equal(res.statusCode, 403);
  assert.equal(saveCalled, false);
});

test('already-approved documents cannot be approved a second time', async () => {
  let saveCalled = false;
  Document.findById = async () => ({
    _id: new mongoose.Types.ObjectId(),
    status: 'Approved',
    uploadedBy: new mongoose.Types.ObjectId(),
    save: async function () { saveCalled = true; },
  });
  const res = await runController(controller.updateDocumentStatus, {
    params: { id: new mongoose.Types.ObjectId().toString() },
    body: { status: 'Approved' },
    user: { _id: new mongoose.Types.ObjectId(), role: 'hr' },
  });
  assert.equal(res.statusCode, 409);
  assert.equal(saveCalled, false);
});

test('a tax document alone does not complete the contract and tax documentation task', async () => {
  const docId = new mongoose.Types.ObjectId();
  const employeeId = new mongoose.Types.ObjectId();
  const mockDoc = {
    _id: docId,
    title: 'Tax declaration',
    category: 'Tax',
    status: 'Pending',
    employee: employeeId,
    save: async function () { return this; },
  };
  const uploadTask = { title: 'Upload Identification & Personal Documents', category: 'Documentation', status: 'Pending' };
  const contractTask = { title: 'Sign Employment Contract & Tax Forms', category: 'Documentation', status: 'Pending' };
  const mockOnboarding = {
    tasks: [uploadTask, contractTask],
    save: async function () { return this; },
  };
  Document.findById = async () => mockDoc;
  Notification.create = async () => ({});
  Onboarding.findOne = async () => mockOnboarding;

  const res = await runController(controller.updateDocumentStatus, {
    params: { id: docId.toString() },
    body: { status: 'Approved' },
    user: { _id: new mongoose.Types.ObjectId(), role: 'hr' },
  });

  assert.equal(res.statusCode, 200);
  assert.equal(uploadTask.status, 'Pending');
  assert.equal(contractTask.status, 'Pending');
});

test('approving an unrelated document does not complete documentation tasks', async () => {
  const docId = new mongoose.Types.ObjectId();
  const employeeId = new mongoose.Types.ObjectId();
  const mockDoc = {
    _id: docId,
    title: 'Miscellaneous document',
    category: 'Other',
    status: 'Pending',
    employee: employeeId,
    save: async function () { return this; },
  };
  const tasks = [
    { title: 'Upload Identification & Personal Documents', category: 'Documentation', status: 'Pending' },
    { title: 'Sign Employment Contract & Tax Forms', category: 'Documentation', status: 'Pending' },
  ];
  Document.findById = async () => mockDoc;
  Notification.create = async () => ({});
  Onboarding.findOne = async () => ({ tasks, save: async function () { return this; } });

  const res = await runController(controller.updateDocumentStatus, {
    params: { id: docId.toString() },
    body: { status: 'Approved' },
    user: { _id: new mongoose.Types.ObjectId(), role: 'hr' },
  });

  assert.equal(res.statusCode, 200);
  assert.deepEqual(tasks.map((task) => task.status), ['Pending', 'Pending']);
});

test('already-approved documents cannot be approved again or advance documentation tasks', async () => {
  const docId = new mongoose.Types.ObjectId();
  const employeeId = new mongoose.Types.ObjectId();
  const mockDoc = {
    _id: docId,
    title: 'National Identity Card',
    category: 'Identification',
    status: 'Approved',
    employee: employeeId,
    save: async function () { return this; },
  };
  const tasks = [
    { title: 'Upload Identification & Personal Documents', category: 'Documentation', status: 'Completed' },
    { title: 'Sign Employment Contract & Tax Forms', category: 'Documentation', status: 'Pending' },
  ];
  Document.findById = async () => mockDoc;
  Notification.create = async () => ({});
  Onboarding.findOne = async () => ({ tasks, save: async function () { return this; } });

  const res = await runController(controller.updateDocumentStatus, {
    params: { id: docId.toString() },
    body: { status: 'Approved' },
    user: { _id: new mongoose.Types.ObjectId(), role: 'hr' },
  });

  assert.equal(res.statusCode, 409);
  assert.deepEqual(tasks.map((task) => task.status), ['Completed', 'Pending']);
});

test('rejecting an approved document reverses only its auto-completed task', async () => {
  const docId = new mongoose.Types.ObjectId();
  const onboardingId = new mongoose.Types.ObjectId();
  const mockDoc = {
    _id: docId,
    title: 'National Identity Card',
    category: 'Identification',
    status: 'Approved',
    onboarding: onboardingId,
    save: async function () { return this; },
  };
  const identityTask = {
    title: 'Upload Identification & Personal Documents',
    category: 'Documentation',
    status: 'Completed',
    completedByDocument: docId,
    completedAt: new Date(),
    completedBy: new mongoose.Types.ObjectId(),
  };
  const contractTask = {
    title: 'Sign Employment Contract & Tax Forms',
    category: 'Documentation',
    status: 'Completed',
    completedByDocument: new mongoose.Types.ObjectId(),
  };
  const onboarding = {
    _id: onboardingId,
    status: 'Completed',
    tasks: [identityTask, contractTask],
    save: async function () { return this; },
  };
  Document.findById = async () => mockDoc;
  Document.findOne = async () => null;
  Notification.create = async () => ({});
  Onboarding.findById = async () => onboarding;

  const res = await runController(controller.updateDocumentStatus, {
    params: { id: docId.toString() },
    body: { status: 'Rejected', rejectionReason: 'Image is unreadable' },
    user: { _id: new mongoose.Types.ObjectId(), role: 'hr' },
  });

  assert.equal(res.statusCode, 200);
  assert.equal(identityTask.status, 'Pending');
  assert.equal(identityTask.completedByDocument, undefined);
  assert.equal(contractTask.status, 'Completed');
  assert.equal(onboarding.status, 'In Progress');
});

test('rejecting one of several approved identity documents preserves task completion', async () => {
  const docId = new mongoose.Types.ObjectId();
  const onboardingId = new mongoose.Types.ObjectId();
  const mockDoc = {
    _id: docId,
    title: 'Identity document A',
    category: 'Identification',
    status: 'Approved',
    onboarding: onboardingId,
    save: async function () { return this; },
  };
  const task = {
    title: 'Upload Identification & Personal Documents',
    category: 'Documentation',
    status: 'Completed',
    completedByDocument: docId,
  };
  const onboarding = {
    _id: onboardingId,
    status: 'Completed',
    tasks: [task],
    save: async function () { return this; },
  };
  Document.findById = async () => mockDoc;
  Document.exists = async (filter) => ['Identification', 'Personal', 'Academic'].includes(filter.category);
  Notification.create = async () => ({});
  Onboarding.findById = async () => onboarding;

  const res = await runController(controller.updateDocumentStatus, {
    params: { id: docId.toString() },
    body: { status: 'Rejected', rejectionReason: 'Wrong document' },
    user: { _id: new mongoose.Types.ObjectId(), role: 'hr' },
  });

  assert.equal(res.statusCode, 200);
  assert.equal(task.status, 'Completed');
});

test('custom documentation tasks auto-complete only after all required document categories are approved', async () => {
  const onboardingId = new mongoose.Types.ObjectId();
  const employeeId = new mongoose.Types.ObjectId();
  const approvedCategories = new Set();
  const task = {
    title: 'Verify all employee records',
    category: 'Documentation',
    documentRequirement: 'identityDocuments',
    status: 'Pending',
  };
  const onboarding = {
    _id: onboardingId,
    employee: employeeId,
    status: 'Pending',
    tasks: [task],
    save: async function () { return this; },
  };
  const docs = ['Identification', 'Personal', 'Academic'].map((category) => ({
    _id: new mongoose.Types.ObjectId(),
    category,
    status: 'Pending',
    employee: employeeId,
    onboarding: onboardingId,
    save: async function () { return this; },
  }));
  Document.exists = async (filter) => approvedCategories.has(filter.category);
  Document.findById = async (id) => docs.find((doc) => String(doc._id) === String(id));
  Onboarding.findById = async () => onboarding;
  Notification.create = async () => ({});

  for (const [index, doc] of docs.entries()) {
    const res = await runController(controller.updateDocumentStatus, {
      params: { id: doc._id.toString() },
      body: { status: 'Approved' },
      user: { _id: new mongoose.Types.ObjectId(), role: 'hr' },
    });
    assert.equal(res.statusCode, 200);
    if (index < 2) assert.equal(task.status, 'Pending');
    approvedCategories.add(doc.category);
  }
  assert.equal(task.status, 'Completed');
});

test('onboarding sync failure does not persist the document status update', async () => {
  const docId = new mongoose.Types.ObjectId();
  let documentSaveCalled = false;
  const document = {
    _id: docId,
    title: 'Identification',
    category: 'Identification',
    status: 'Pending',
    onboarding: new mongoose.Types.ObjectId(),
    save: async function () { documentSaveCalled = true; return this; },
  };
  const task = {
    title: 'Custom identity review',
    category: 'Documentation',
    documentRequirement: 'identityDocuments',
    status: 'Pending',
  };
  const onboarding = {
    status: 'In Progress',
    tasks: [task],
    save: async () => { throw new Error('checklist write failed'); },
  };
  Document.exists = async () => true;
  Document.findById = async () => document;
  Onboarding.findById = async () => onboarding;

  await assert.rejects(
    runController(controller.updateDocumentStatus, {
      params: { id: docId.toString() },
      body: { status: 'Approved' },
      user: { _id: new mongoose.Types.ObjectId(), role: 'hr' },
    }),
    /checklist write failed/
  );
  assert.equal(documentSaveCalled, false);
});

test('document serialization does not expose stored file bytes', () => {
  const document = new Document({
    title: 'Private document',
    fileUrl: '/api/documents/1/file',
    fileContent: Buffer.from('%PDF-'),
  });
  assert.equal(document.toJSON().fileContent, undefined);
  assert.equal(document.toObject().fileContent, undefined);
});

test('document upload rejects files larger than the server-side maximum', async () => {
  let createCalled = false;
  Document.create = async () => { createCalled = true; };
  const res = await runController(controller.uploadDocument, {
    query: { title: 'Oversized file', fileSize: '1' },
    body: Buffer.alloc(10 * 1024 * 1024 + 1),
    user: { _id: new mongoose.Types.ObjectId(), role: 'employee' },
  });

  assert.equal(res.statusCode, 413);
  assert.equal(createCalled, false);
});

test('document upload enforces the per-uploader storage quota', async () => {
  let createCalled = false;
  User.exists = async () => true;
  Document.aggregate = async (pipeline) => pipeline[0].$match.uploadedBy
    ? [{ bytes: 50 * 1024 * 1024 }]
    : [{ bytes: 0 }];
  Document.create = async () => { createCalled = true; };
  const res = await runController(controller.uploadDocument, {
    query: { title: 'Over quota', category: 'Personal' },
    body: Buffer.from('%PDF-1.7\n'),
    user: { _id: new mongoose.Types.ObjectId(), role: 'employee' },
  });
  assert.equal(res.statusCode, 413);
  assert.match(res.body.message, /storage quota/);
  assert.equal(createCalled, false);
});

test('document upload enforces the total database storage quota', async () => {
  let createCalled = false;
  User.exists = async () => true;
  Document.aggregate = async (pipeline) => pipeline[0].$match.uploadedBy
    ? [{ bytes: 0 }]
    : [{ bytes: 1024 * 1024 * 1024 }];
  Document.create = async () => { createCalled = true; };
  const res = await runController(controller.uploadDocument, {
    query: { title: 'Global quota reached', category: 'Personal' },
    body: Buffer.from('%PDF-1.7\n'),
    user: { _id: new mongoose.Types.ObjectId(), role: 'employee' },
  });
  assert.equal(res.statusCode, 507);
  assert.match(res.body.message, /storage capacity/i);
  assert.equal(createCalled, false);
});

test('updateDocumentStatus requires rejectionReason when rejecting a document', async () => {
  const docId = new mongoose.Types.ObjectId();
  const res = await runController(controller.updateDocumentStatus, {
    params: { id: docId.toString() },
    body: { status: 'Rejected' },
    user: { _id: new mongoose.Types.ObjectId(), role: 'hr' },
  });

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, 'rejectionReason is required when status is Rejected');
});

test('document routes expose required endpoints', () => {
  const routes = documentRoutes.stack
    .filter((layer) => layer.route)
    .map((layer) => ({ path: layer.route.path, methods: Object.keys(layer.route.methods) }));

  assert(routes.some((r) => r.path === '/' && r.methods.includes('post')));
  assert(routes.some((r) => r.path === '/upload' && r.methods.includes('post')));
  assert(routes.some((r) => r.path === '/' && r.methods.includes('get')));
  assert(routes.some((r) => r.path === '/my-documents' && r.methods.includes('get')));
  assert(routes.some((r) => r.path === '/:id/file' && r.methods.includes('get')));
  assert(routes.some((r) => r.path === '/:id' && r.methods.includes('get')));
  assert(routes.some((r) => r.path === '/:id/status' && r.methods.includes('patch')));
  assert(routes.some((r) => r.path === '/:id' && r.methods.includes('delete')));
});

test('Swagger and Postman document the binary upload and download API', () => {
  assert(swaggerDocument.paths['/documents/upload'].post);
  assert(swaggerDocument.paths['/documents/{id}/file'].get);
  assert.equal(swaggerDocument.paths['/documents'].post.requestBody, undefined);
  const upload = postmanCollection.item.find((item) => item.name === 'Upload Document');
  assert.match(upload.request.url, /\/documents\/upload\?/);
  assert.equal(upload.request.body.mode, 'file');
  assert.equal(postmanCollection.item.some((item) => item.name === 'Download Document File'), true);
});

test('request-size errors report the actual JSON and document upload limits', () => {
  const makeResponse = () => ({
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  });
  for (const [path, type, limit, expected] of [
    ['/api/documents/upload', 'application/octet-stream', 4 * 1024 * 1024, /4MB/],
    ['/api/employees', 'application/json', 10 * 1024, /10KB/],
    ['/api/performance/reports', 'application/json', 256 * 1024, /256KB/],
  ]) {
    const req = { path, is: (contentType) => contentType === type };
    const res = makeResponse();
    errorHandler({ type: 'entity.too.large', status: 413, limit }, req, res, () => {});
    assert.equal(res.statusCode, 413);
    assert.match(res.body.message, expected);
  }
});
