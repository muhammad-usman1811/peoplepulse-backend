const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Candidate = require('./src/models/Candidate');
const JobPosting = require('./src/models/JobPosting');
const controller = require('./src/controllers/recruitmentController');
const recruitmentStages = require('./src/utils/recruitmentStages');
const recruitmentRoutes = require('./src/routes/recruitmentRoutes');

const originalMethods = {
  candidateCreate: Candidate.create,
  candidateFindByIdAndUpdate: Candidate.findByIdAndUpdate,
  jobPostingCreate: JobPosting.create,
  jobPostingExists: JobPosting.exists,
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
  Candidate.create = originalMethods.candidateCreate;
  Candidate.findByIdAndUpdate = originalMethods.candidateFindByIdAndUpdate;
  JobPosting.create = originalMethods.jobPostingCreate;
  JobPosting.exists = originalMethods.jobPostingExists;
});

test('job posting requires a non-empty title and department', async (t) => {
  for (const body of [
    { title: 'Backend Engineer' },
    { department: 'Engineering' },
    { title: '  ', department: 'Engineering' },
    { title: 'Backend Engineer', department: '  ' },
  ]) {
    await t.test(JSON.stringify(body), async () => {
      let createCalled = false;
      JobPosting.create = async () => { createCalled = true; };
      const res = await runController(controller.createJobPosting, { body });
      assert.equal(res.statusCode, 400);
      assert.equal(createCalled, false);
    });
  }
});

test('job posting trims and creates title and department', async () => {
  let created;
  JobPosting.create = async (values) => { created = values; return values; };
  const res = await runController(controller.createJobPosting, {
    body: { title: '  Backend Engineer ', department: ' Engineering  ' },
  });

  assert.equal(res.statusCode, 201);
  assert.deepEqual(created, { title: 'Backend Engineer', department: 'Engineering' });
});

test('candidate creation validates posting and starts in Applied stage', async () => {
  const postingId = new mongoose.Types.ObjectId();
  let created;
  JobPosting.exists = async () => true;
  Candidate.create = async (values) => {
    created = values;
    return { ...values, stage: 'Applied' };
  };

  const res = await runController(controller.createCandidate, {
    body: { name: '  Alex Candidate ', email: ' Alex@Example.com ', jobPosting: postingId.toString() },
  });

  assert.equal(res.statusCode, 201);
  assert.equal(created.name, 'Alex Candidate');
  assert.equal(created.email, 'alex@example.com');
  assert.equal(String(created.jobPosting), postingId.toString());
  assert.equal(res.body.data.candidate.stage, 'Applied');
});

test('candidate creation rejects invalid email and unknown posting', async (t) => {
  const postingId = new mongoose.Types.ObjectId();
  await t.test('invalid email', async () => {
    let existsCalled = false;
    JobPosting.exists = async () => { existsCalled = true; return true; };
    const res = await runController(controller.createCandidate, {
      body: { name: 'Alex Candidate', email: 'not-an-email', jobPosting: postingId.toString() },
    });
    assert.equal(res.statusCode, 400);
    assert.equal(existsCalled, false);
  });

  await t.test('unknown posting', async () => {
    let createCalled = false;
    JobPosting.exists = async () => false;
    Candidate.create = async () => { createCalled = true; };
    const res = await runController(controller.createCandidate, {
      body: { name: 'Alex Candidate', email: 'alex@example.com', jobPosting: postingId.toString() },
    });
    assert.equal(res.statusCode, 404);
    assert.equal(createCalled, false);
  });
});

test('candidate can be moved through every recruitment stage', async () => {
  const candidateId = new mongoose.Types.ObjectId();
  const candidate = { _id: candidateId, stage: 'Applied' };
  const requestedStages = [];
  Candidate.findByIdAndUpdate = async (id, update, options) => {
    assert.equal(String(id), candidateId.toString());
    assert.equal(options.new, true);
    assert.equal(options.runValidators, true);
    candidate.stage = update.$set.stage;
    requestedStages.push(candidate.stage);
    return candidate;
  };

  for (const stage of recruitmentStages) {
    const res = await runController(controller.moveCandidateStage, {
      params: { candidateId: candidateId.toString() },
      body: { stage },
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.data.candidate.stage, stage);
  }

  assert.deepEqual(requestedStages, recruitmentStages);
});

test('candidate stage update rejects invalid stages and missing candidates', async (t) => {
  await t.test('invalid stage', async () => {
    let updateCalled = false;
    Candidate.findByIdAndUpdate = async () => { updateCalled = true; };
    const res = await runController(controller.moveCandidateStage, {
      params: { candidateId: new mongoose.Types.ObjectId().toString() },
      body: { stage: 'Rejected' },
    });
    assert.equal(res.statusCode, 400);
    assert.equal(updateCalled, false);
  });

  await t.test('candidate does not exist', async () => {
    Candidate.findByIdAndUpdate = async () => null;
    const res = await runController(controller.moveCandidateStage, {
      params: { candidateId: new mongoose.Types.ObjectId().toString() },
      body: { stage: 'Screening' },
    });
    assert.equal(res.statusCode, 404);
  });
});

test('candidate model defaults to Applied and permits only pipeline stages', () => {
  const candidate = new Candidate({
    name: 'Alex Candidate',
    email: 'alex@example.com',
    jobPosting: new mongoose.Types.ObjectId(),
  });
  assert.equal(candidate.stage, 'Applied');
  assert.equal(candidate.validateSync(), undefined);
  candidate.stage = 'Rejected';
  assert(candidate.validateSync().errors.stage);
});

test('candidate creation returns 409 when candidate has already applied to posting', async () => {
  const postingId = new mongoose.Types.ObjectId();
  JobPosting.exists = async () => true;
  Candidate.create = async () => {
    const err = new Error('Duplicate key');
    err.code = 11000;
    throw err;
  };

  const res = await runController(controller.createCandidate, {
    body: { name: 'Alex Candidate', email: 'alex@example.com', jobPosting: postingId.toString() },
  });

  assert.equal(res.statusCode, 409);
  assert.equal(res.body.success, false);
  assert.equal(res.body.message, 'Candidate already applied to this posting');
});

test('candidate model specifies unique compound index on jobPosting and email', () => {
  const indexes = Candidate.schema.indexes();
  const compoundIndex = indexes.find(
    ([fields]) => fields.jobPosting === 1 && fields.email === 1
  );
  assert(compoundIndex, 'Compound index on jobPosting and email must exist');
  assert.equal(compoundIndex[1]?.unique, true, 'Compound index must be unique');
});

test('recruitment endpoints expose only the creation and stage routes', () => {
  const registered = recruitmentRoutes.stack
    .filter((layer) => layer.route)
    .map((layer) => ({ path: layer.route.path, methods: Object.keys(layer.route.methods) }));
  assert.deepEqual(registered, [
    { path: '/job-postings', methods: ['post'] },
    { path: '/candidates', methods: ['post'] },
    { path: '/candidates/:candidateId/stage', methods: ['patch'] },
  ]);
});