const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Candidate = require('./src/models/Candidate');
const JobPosting = require('./src/models/JobPosting');
const Onboarding = require('./src/models/Onboarding');
const User = require('./src/models/User');
const controller = require('./src/controllers/recruitmentController');
const recruitmentStages = require('./src/utils/recruitmentStages');
const recruitmentRoutes = require('./src/routes/recruitmentRoutes');

const originalMethods = {
  candidateCreate: Candidate.create,
  candidateFindById: Candidate.findById,
  candidateFindByIdAndUpdate: Candidate.findByIdAndUpdate,
  candidateFind: Candidate.find,
  candidateCountDocuments: Candidate.countDocuments,
  jobPostingCreate: JobPosting.create,
  jobPostingExists: JobPosting.exists,
  jobPostingFind: JobPosting.find,
  jobPostingFindById: JobPosting.findById,
  jobPostingCountDocuments: JobPosting.countDocuments,
  onboardingCreate: Onboarding.create,
  onboardingFindOne: Onboarding.findOne,
  userFindOne: User.findOne,
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
  Candidate.findById = originalMethods.candidateFindById;
  Candidate.findByIdAndUpdate = originalMethods.candidateFindByIdAndUpdate;
  Candidate.find = originalMethods.candidateFind;
  Candidate.countDocuments = originalMethods.candidateCountDocuments;
  JobPosting.create = originalMethods.jobPostingCreate;
  JobPosting.exists = originalMethods.jobPostingExists;
  JobPosting.find = originalMethods.jobPostingFind;
  JobPosting.findById = originalMethods.jobPostingFindById;
  JobPosting.countDocuments = originalMethods.jobPostingCountDocuments;
  Onboarding.create = originalMethods.onboardingCreate;
  Onboarding.findOne = originalMethods.onboardingFindOne;
  User.findOne = originalMethods.userFindOne;
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

test('candidate can be moved through recruitment stages and Hired stage triggers onboarding', async () => {
  const candidateId = new mongoose.Types.ObjectId();
  const requestedStages = [];
  const candidate = {
    _id: candidateId,
    name: 'Fahad Candidate',
    email: 'fahad@example.test',
    stage: 'Applied',
    save: async function () {
      requestedStages.push(this.stage);
      return this;
    },
  };
  Candidate.findById = async () => candidate;

  Onboarding.findOne = async () => null;
  User.findOne = async () => null;
  Onboarding.create = async (data) => ({ _id: new mongoose.Types.ObjectId(), ...data });

  for (const stage of recruitmentStages) {
    const res = await runController(controller.moveCandidateStage, {
      params: { candidateId: candidateId.toString() },
      body: { stage },
      user: { _id: new mongoose.Types.ObjectId(), role: 'hr' },
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.data.candidate.stage, stage);
    if (stage === 'Hired') {
      assert(res.body.data.onboarding, 'Onboarding checklist must be attached on Hired stage');
    }
  }

  assert.deepEqual(requestedStages, recruitmentStages.slice(1));
});

test('candidate cannot skip directly to Hired or move backwards after hire', async (t) => {
  const candidateId = new mongoose.Types.ObjectId();
  for (const [currentStage, requestedStage] of [['Applied', 'Hired'], ['Hired', 'Offer']]) {
    await t.test(`${currentStage} -> ${requestedStage}`, async () => {
      let saveCalled = false;
      Candidate.findById = async () => ({
        _id: candidateId,
        stage: currentStage,
        save: async function () { saveCalled = true; return this; },
      });
      const res = await runController(controller.moveCandidateStage, {
        params: { candidateId: candidateId.toString() },
        body: { stage: requestedStage },
        user: { _id: new mongoose.Types.ObjectId(), role: 'hr' },
      });
      assert.equal(res.statusCode, 409);
      assert.equal(saveCalled, false);
    });
  }
});

test('recruitment lists return paginated filtered job postings and candidates', async () => {
  const candidate = { name: 'Alex Candidate', email: 'alex@example.test', stage: 'Offer' };
  let capturedFilter;
  JobPosting.countDocuments = async () => 1;
  JobPosting.find = () => ({
    sort: () => ({ skip: () => ({ limit: async () => [{ title: 'Engineer' }] }) }),
  });
  Candidate.countDocuments = async (filter) => { capturedFilter = filter; return 1; };
  Candidate.find = () => ({
    sort: () => ({
      skip: () => ({
        limit: () => ({
          populate: () => ({
            populate: async () => [candidate],
          }),
        }),
      }),
    }),
  });

  const postingsRes = await runController(controller.getJobPostings, { query: { page: '1', limit: '10' } });
  const candidatesRes = await runController(controller.getCandidates, {
    query: { page: '1', limit: '10', stage: 'Offer', search: 'alex', jobPosting: new mongoose.Types.ObjectId().toString() },
  });

  assert.equal(postingsRes.statusCode, 200);
  assert.equal(postingsRes.body.data.jobPostings.length, 1);
  assert.equal(candidatesRes.statusCode, 200);
  assert.equal(candidatesRes.body.data.candidates.length, 1);
  assert.equal(capturedFilter.stage, 'Offer');
  assert(capturedFilter.$or[0].name.test(candidate.name));
});

test('hireCandidate directly hires candidate and initializes onboarding', async () => {
  const candidateId = new mongoose.Types.ObjectId();
  const candidateDoc = {
    _id: candidateId,
    name: 'Easha Candidate',
    email: 'easha@example.test',
    stage: 'Offer',
    save: async function () { return this; },
  };

  Candidate.findById = async () => candidateDoc;
  Onboarding.findOne = async () => null;
  User.findOne = async () => null;
  Onboarding.create = async (data) => ({ _id: new mongoose.Types.ObjectId(), ...data });

  const res = await runController(controller.hireCandidate, {
    params: { candidateId: candidateId.toString() },
    user: { _id: new mongoose.Types.ObjectId(), role: 'hr' },
  });

  assert.equal(res.statusCode, 200);
  assert.equal(candidateDoc.stage, 'Hired');
  assert(res.body.data.onboarding);
});

test('candidate stage update rejects invalid stages and missing candidates', async (t) => {
  await t.test('invalid stage', async () => {
    let updateCalled = false;
    Candidate.findById = async () => ({ _id: new mongoose.Types.ObjectId() });
    Candidate.findByIdAndUpdate = async () => { updateCalled = true; };
    const res = await runController(controller.moveCandidateStage, {
      params: { candidateId: new mongoose.Types.ObjectId().toString() },
      body: { stage: 'Rejected' },
    });
    assert.equal(res.statusCode, 400);
    assert.equal(updateCalled, false);
  });

  await t.test('candidate does not exist', async () => {
    Candidate.findById = async () => null;
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

test('recruitment endpoints expose creation, stage, hire, and onboarding routes', () => {
  const registered = recruitmentRoutes.stack
    .filter((layer) => layer.route)
    .map((layer) => ({ path: layer.route.path, methods: Object.keys(layer.route.methods) }));

  assert.deepEqual(registered, [
    { path: '/job-postings', methods: ['get'] },
    { path: '/job-postings/:jobPostingId', methods: ['get'] },
    { path: '/job-postings', methods: ['post'] },
    { path: '/candidates', methods: ['get'] },
    { path: '/candidates/:candidateId', methods: ['get'] },
    { path: '/candidates', methods: ['post'] },
    { path: '/candidates/:candidateId/stage', methods: ['patch'] },
    { path: '/candidates/:candidateId/hire', methods: ['post'] },
    { path: '/candidates/:candidateId/onboarding', methods: ['get'] },
  ]);
});