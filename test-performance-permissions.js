const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const User = require('./src/models/User');
const Review = require('./src/models/Review');
const PerformanceCycle = require('./src/models/PerformanceCycle');
const controller = require('./src/controllers/performanceController');

const ids = {
  employee: new mongoose.Types.ObjectId(),
  manager: new mongoose.Types.ObjectId(),
  otherManager: new mongoose.Types.ObjectId(),
  outsider: new mongoose.Types.ObjectId(),
  hr: new mongoose.Types.ObjectId(),
  review: new mongoose.Types.ObjectId(),
  cycle: new mongoose.Types.ObjectId(),
  teammate: new mongoose.Types.ObjectId(),
};

const originalMethods = {
  userFind: User.find,
  reviewFind: Review.find,
  reviewFindById: Review.findById,
  reviewCreate: Review.create,
  reviewCountDocuments: Review.countDocuments,
  cycleFindOne: PerformanceCycle.findOne,
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

const createQuery = (value) => ({
  populate() { return this; },
  sort() { return this; },
  skip() { return this; },
  limit() { return this; },
  then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); },
});

const runController = async (handler, req) => {
  const res = createResponse();
  let nextError;
  await handler(req, res, (error) => { nextError = error; });
  if (nextError) throw nextError;
  return res;
};

const reviewFixture = () => ({
  _id: ids.review,
  employee: { _id: ids.employee, manager: ids.manager },
  cycle: { _id: ids.cycle, period: 'Test cycle' },
});

const asUser = (id, role = 'employee') => ({ _id: id, role });

test.afterEach(() => {
  User.find = originalMethods.userFind;
  Review.find = originalMethods.reviewFind;
  Review.findById = originalMethods.reviewFindById;
  Review.create = originalMethods.reviewCreate;
  Review.countDocuments = originalMethods.reviewCountDocuments;
  PerformanceCycle.findOne = originalMethods.cycleFindOne;
});

test('employee can view their own review', async () => {
  Review.findById = () => createQuery(reviewFixture());
  const res = await runController(controller.getReview, {
    params: { reviewId: ids.review.toString() },
    user: asUser(ids.employee),
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.review._id, ids.review);
});

test('assigned manager can view the employee review', async () => {
  Review.findById = () => createQuery(reviewFixture());
  const res = await runController(controller.getReview, {
    params: { reviewId: ids.review.toString() },
    user: asUser(ids.manager),
  });

  assert.equal(res.statusCode, 200);
});

test('HR can view any employee review', async (t) => {
  for (const role of ['hr', 'admin', 'superadmin']) {
    await t.test(`role: ${role}`, async () => {
      Review.findById = () => createQuery(reviewFixture());
      const res = await runController(controller.getReview, {
        params: { reviewId: ids.review.toString() },
        user: asUser(ids.hr, role),
      });

      assert.equal(res.statusCode, 200);
    });
  }
});

test('unrelated employee and unrelated manager cannot view a review', async (t) => {
  for (const [label, actor] of [
    ['unrelated employee', asUser(ids.outsider)],
    ['unrelated manager', asUser(ids.otherManager)],
  ]) {
    await t.test(label, async () => {
      Review.findById = () => createQuery(reviewFixture());
      const res = await runController(controller.getReview, {
        params: { reviewId: ids.review.toString() },
        user: actor,
      });

      assert.equal(res.statusCode, 403);
      assert.equal(res.body.success, false);
    });
  }
});

test('missing or malformed review IDs do not disclose a review', async (t) => {
  await t.test('missing review', async () => {
    Review.findById = () => createQuery(null);
    const res = await runController(controller.getReview, {
      params: { reviewId: ids.review.toString() },
      user: asUser(ids.employee),
    });
    assert.equal(res.statusCode, 404);
  });

  await t.test('malformed ID', async () => {
    Review.findById = () => { throw new Error('must not query malformed IDs'); };
    const res = await runController(controller.getReview, {
      params: { reviewId: 'not-an-object-id' },
      user: asUser(ids.employee),
    });
    assert.equal(res.statusCode, 404);
  });
});

test('team review list queries only the requesting manager direct reports', async () => {
  let capturedFilter;
  const reviews = [{ _id: ids.review }];
  User.find = (filter) => {
    assert.equal(String(filter.manager), String(ids.manager));
    assert.equal(filter.role, 'employee');
    return { select: () => ({ lean: async () => [{ _id: ids.teammate }] }) };
  };
  Review.find = (filter) => {
    capturedFilter = filter;
    return createQuery(reviews);
  };
  Review.countDocuments = async () => 1;

  const res = await runController(controller.listTeamReviews, {
    query: { page: '1', limit: '10' },
    user: asUser(ids.manager),
  });

  assert.deepEqual(capturedFilter.employee.$in, [ids.teammate]);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.data.reviews, reviews);
  assert.equal(res.body.data.teamSize, 1);
});

test('self-review submission stores validated goals and KPIs', async () => {
  const submitted = {};
  PerformanceCycle.findOne = async () => ({ _id: ids.cycle });
  Review.create = async (values) => {
    Object.assign(submitted, values);
    return values;
  };
  const res = await runController(controller.submitSelfReview, {
    params: { cycleId: ids.cycle.toString() },
    user: asUser(ids.employee),
    body: {
      selfReview: 'Completed planned work.',
      rating: 4,
      goals: [{
        title: 'Improve response time',
        status: 'in_progress',
        kpis: [{ name: 'Average response time', target: 4, actual: 5, unit: 'hours', weight: 50 }],
      }],
    },
  });

  assert.equal(res.statusCode, 201);
  assert.equal(submitted.goals[0].kpis[0].target, 4);
  assert.equal(submitted.goals[0].kpis[0].actual, 5);
});

test('self-review treats null goals as no goals', async () => {
  let submitted;
  PerformanceCycle.findOne = async () => ({ _id: ids.cycle });
  Review.create = async (values) => {
    submitted = values;
    return values;
  };
  const res = await runController(controller.submitSelfReview, {
    params: { cycleId: ids.cycle.toString() },
    user: asUser(ids.employee),
    body: { selfReview: 'Completed planned work.', rating: 4, goals: null },
  });

  assert.equal(res.statusCode, 201);
  assert.deepEqual(submitted.goals, []);
});

test('invalid KPI values are rejected before a review is created', async () => {
  let createCalled = false;
  PerformanceCycle.findOne = async () => ({ _id: ids.cycle });
  Review.create = async () => { createCalled = true; };
  const res = await runController(controller.submitSelfReview, {
    params: { cycleId: ids.cycle.toString() },
    user: asUser(ids.employee),
    body: {
      selfReview: 'Completed planned work.',
      rating: 4,
      goals: [{ title: 'Improve response time', kpis: [{ name: 'Response time', target: 'fast' }] }],
    },
  });

  assert.equal(res.statusCode, 400);
  assert.equal(createCalled, false);
});

test('self-review cannot be submitted to a closed cycle', async () => {
  let createCalled = false;
  PerformanceCycle.findOne = async () => null;
  Review.create = async () => { createCalled = true; };
  const res = await runController(controller.submitSelfReview, {
    params: { cycleId: ids.cycle.toString() },
    user: asUser(ids.employee),
    body: { selfReview: 'Completed planned work.', rating: 4 },
  });

  assert.equal(res.statusCode, 404);
  assert.equal(createCalled, false);
});

test('duplicate cycle submissions return conflict', async () => {
  PerformanceCycle.findOne = async () => ({ _id: ids.cycle });
  Review.create = async () => { throw { code: 11000 }; };
  const res = await runController(controller.submitSelfReview, {
    params: { cycleId: ids.cycle.toString() },
    user: asUser(ids.employee),
    body: { selfReview: 'Completed planned work.', rating: 4 },
  });

  assert.equal(res.statusCode, 409);
});

test('cycle dates are optional but validated as a paired ordered range', async (t) => {
  let created;
  PerformanceCycle.create = async (values) => {
    created = values;
    return values;
  };

  await t.test('valid range persists', async () => {
    const res = await runController(controller.createCycle, {
      body: { period: '2026-Q4', startDate: '2026-10-01', endDate: '2026-12-31' },
    });
    assert.equal(res.statusCode, 201);
    assert.equal(created.startDate.toISOString(), '2026-10-01T00:00:00.000Z');
    assert.equal(created.endDate.toISOString(), '2026-12-31T00:00:00.000Z');
  });

  await t.test('period-only request remains backward compatible', async () => {
    const res = await runController(controller.createCycle, { body: { period: '2027-Q1' } });
    assert.equal(res.statusCode, 201);
    assert.equal(created.startDate, undefined);
    assert.equal(created.endDate, undefined);
  });

  for (const body of [
    { period: 'Missing End', startDate: '2026-10-01' },
    { period: 'Invalid Day', startDate: '2026-02-30', endDate: '2026-03-01' },
    { period: 'Reversed Dates', startDate: '2026-12-31', endDate: '2026-10-01' },
    { period: 'Invalid Status', status: 'pending' },
  ]) {
    await t.test(JSON.stringify(body), async () => {
      const res = await runController(controller.createCycle, { body });
      assert.equal(res.statusCode, 400);
    });
  }
});

test('assigned manager and HR can submit manager review and rating', async (t) => {
  await t.test('assigned manager submit', async () => {
    let saved = false;
    const fixture = {
      _id: ids.review,
      employee: { _id: ids.employee, manager: ids.manager },
      cycle: { _id: ids.cycle, period: 'Test cycle', status: 'open' },
      save: async function () { saved = true; return this; },
    };
    Review.findById = () => createQuery(fixture);

    const res = await runController(controller.submitManagerReview, {
      params: { reviewId: ids.review.toString() },
      user: asUser(ids.manager),
      body: { managerReview: 'Good performance this quarter.', rating: 5 },
    });

    assert.equal(res.statusCode, 200);
    assert.equal(saved, true);
    assert.equal(fixture.managerReview, 'Good performance this quarter.');
    assert.equal(fixture.rating, 5);
  });

  await t.test('HR submit', async () => {
    let saved = false;
    const fixture = {
      _id: ids.review,
      employee: { _id: ids.employee, manager: ids.manager },
      cycle: { _id: ids.cycle, period: 'Test cycle', status: 'open' },
      save: async function () { saved = true; return this; },
    };
    Review.findById = () => createQuery(fixture);

    const res = await runController(controller.submitManagerReview, {
      params: { reviewId: ids.review.toString() },
      user: asUser(ids.hr, 'hr'),
      body: { managerReview: 'HR validated review.', rating: 4 },
    });

    assert.equal(res.statusCode, 200);
    assert.equal(saved, true);
  });
});

test('unrelated manager or employee cannot submit manager review', async (t) => {
  for (const [label, actor] of [
    ['unrelated employee', asUser(ids.outsider)],
    ['unrelated manager', asUser(ids.otherManager)],
    ['employee themself', asUser(ids.employee)],
  ]) {
    await t.test(label, async () => {
      const fixture = {
        _id: ids.review,
        employee: { _id: ids.employee, manager: ids.manager },
        cycle: { _id: ids.cycle, period: 'Test cycle', status: 'open' },
        save: async () => { },
      };
      Review.findById = () => createQuery(fixture);

      const res = await runController(controller.submitManagerReview, {
        params: { reviewId: ids.review.toString() },
        user: actor,
        body: { managerReview: 'Unauthorized attempt', rating: 3 },
      });

      assert.equal(res.statusCode, 403);
      assert.equal(res.body.success, false);
    });
  }
});

test('manager review rejects closed cycle, invalid rating, and missing content', async (t) => {
  await t.test('closed cycle', async () => {
    const fixture = {
      _id: ids.review,
      employee: { _id: ids.employee, manager: ids.manager },
      cycle: { _id: ids.cycle, period: 'Closed cycle', status: 'closed' },
    };
    Review.findById = () => createQuery(fixture);

    const res = await runController(controller.submitManagerReview, {
      params: { reviewId: ids.review.toString() },
      user: asUser(ids.manager),
      body: { managerReview: 'Attempt on closed cycle', rating: 4 },
    });

    assert.equal(res.statusCode, 400);
  });

  await t.test('invalid rating', async () => {
    const fixture = {
      _id: ids.review,
      employee: { _id: ids.employee, manager: ids.manager },
      cycle: { _id: ids.cycle, period: 'Test cycle', status: 'open' },
    };
    Review.findById = () => createQuery(fixture);

    const res = await runController(controller.submitManagerReview, {
      params: { reviewId: ids.review.toString() },
      user: asUser(ids.manager),
      body: { managerReview: 'Valid review', rating: 6 },
    });

    assert.equal(res.statusCode, 400);
  });

  await t.test('missing managerReview', async () => {
    const fixture = {
      _id: ids.review,
      employee: { _id: ids.employee, manager: ids.manager },
      cycle: { _id: ids.cycle, period: 'Test cycle', status: 'open' },
    };
    Review.findById = () => createQuery(fixture);

    const res = await runController(controller.submitManagerReview, {
      params: { reviewId: ids.review.toString() },
      user: asUser(ids.manager),
      body: { managerReview: '   ', rating: 4 },
    });

    assert.equal(res.statusCode, 400);
  });
});