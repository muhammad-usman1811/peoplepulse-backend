require('dotenv').config();
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const User = require('./src/models/User');
const Review = require('./src/models/Review');
const PerformanceCycle = require('./src/models/PerformanceCycle');
const { getTestMongoUri } = require('./src/utils/testDatabase');

const baseUrl = `${process.env.BASE_URL || 'http://localhost:5000'}/api`;
const password = process.env.TEST_USER_PASSWORD;
const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const request = async (path, options = {}) => {
  const response = await fetch(`${baseUrl}${path}`, options);
  return { status: response.status, data: await response.json() };
};

const login = async (email, loginPassword = password) => {
  const result = await request('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: loginPassword }),
  });
  assert.equal(result.status, 200, `Login failed for ${email}`);
  return { Authorization: `Bearer ${result.data.data.token}`, 'Content-Type': 'application/json' };
};

(async () => {
  assert(password, 'Set TEST_USER_PASSWORD for performance integration tests');
  await mongoose.connect(getTestMongoUri());

  const users = [];
  const cycles = [];
  const reviews = [];
  try {
    const health = await request('/health');
    assert.equal(health.status, 200);
    assert.equal(health.data.data.environment, 'test', 'API server must run in test mode');

    const manager = await User.create({
      name: 'Performance Test Manager',
      email: `performance.manager.${suffix}@example.test`,
      password,
      role: 'admin',
    });
    const employee = await User.create({
      name: 'Performance Test Employee',
      email: `performance.employee.${suffix}@example.test`,
      password,
      role: 'employee',
      manager: manager._id,
    });
    const unrelatedManager = await User.create({
      name: 'Unrelated Test Manager',
      email: `performance.other.manager.${suffix}@example.test`,
      password,
      role: 'employee',
    });
    const unrelatedEmployee = await User.create({
      name: 'Unrelated Test Employee',
      email: `performance.other.employee.${suffix}@example.test`,
      password,
      role: 'employee',
      manager: unrelatedManager._id,
    });
    users.push(manager._id, employee._id, unrelatedManager._id, unrelatedEmployee._id);

    const managerHeaders = await login(manager.email);
    const employeeHeaders = await login(employee.email);
    const unrelatedManagerHeaders = await login(unrelatedManager.email);
    const unrelatedEmployeeHeaders = await login(unrelatedEmployee.email);
    const hrHeaders = await login(process.env.TEST_ADMIN_EMAIL, process.env.TEST_ADMIN_PASSWORD);

    const createdCycle = await request('/performance/cycles', {
      method: 'POST',
      headers: hrHeaders,
      body: JSON.stringify({ period: `Performance API ${suffix}`, status: 'open' }),
    });
    assert.equal(createdCycle.status, 201, 'HR should create a performance cycle');
    const openCycleId = createdCycle.data.data.cycle._id;
    cycles.push(openCycleId);

    const closedCycle = await PerformanceCycle.create({ period: `Closed Performance API ${suffix}`, status: 'closed' });
    cycles.push(closedCycle._id);

    const submitted = await request(`/performance/cycles/${openCycleId}/reviews`, {
      method: 'POST',
      headers: employeeHeaders,
      body: JSON.stringify({
        selfReview: 'Delivered planned work.',
        rating: 4,
        goals: [{
          title: 'Improve response time',
          status: 'in_progress',
          kpis: [{ name: 'Average response time', target: 4, actual: 5, unit: 'hours', weight: 60 }],
        }],
      }),
    });
    assert.equal(submitted.status, 201, 'Employee should submit a goal/KPI review');
    const reviewId = submitted.data.data.review._id;
    reviews.push(reviewId);
    assert.equal(submitted.data.data.review.goals[0].kpis[0].target, 4);

    const duplicate = await request(`/performance/cycles/${openCycleId}/reviews`, {
      method: 'POST',
      headers: employeeHeaders,
      body: JSON.stringify({ selfReview: 'Duplicate review.', rating: 3 }),
    });
    assert.equal(duplicate.status, 409, 'Duplicate cycle review must conflict');

    const closedSubmission = await request(`/performance/cycles/${closedCycle._id}/reviews`, {
      method: 'POST',
      headers: employeeHeaders,
      body: JSON.stringify({ selfReview: 'Closed cycle review.', rating: 3 }),
    });
    assert.equal(closedSubmission.status, 404, 'Closed cycle must reject self-review');

    for (const [label, headers] of [
      ['owner', employeeHeaders],
      ['assigned manager', managerHeaders],
      ['HR', hrHeaders],
    ]) {
      const visible = await request(`/performance/reviews/${reviewId}`, { headers });
      assert.equal(visible.status, 200, `${label} should read the review`);
    }

    for (const [label, headers] of [
      ['unrelated employee', unrelatedEmployeeHeaders],
      ['unrelated manager', unrelatedManagerHeaders],
    ]) {
      const denied = await request(`/performance/reviews/${reviewId}`, { headers });
      assert.equal(denied.status, 403, `${label} must not read another employee review`);
    }

    const managerTeam = await request('/performance/team/reviews', { headers: managerHeaders });
    assert.equal(managerTeam.status, 200);
    assert(managerTeam.data.data.reviews.some((review) => String(review._id) === String(reviewId)));

    const unrelatedTeam = await request('/performance/team/reviews', { headers: unrelatedManagerHeaders });
    assert.equal(unrelatedTeam.status, 200);
    assert.equal(unrelatedTeam.data.data.reviews.some((review) => String(review._id) === String(reviewId)), false);

    // Manager review submission test
    const unauthorizedReviewSubmit = await request(`/performance/reviews/${reviewId}/manager-review`, {
      method: 'PUT',
      headers: unrelatedManagerHeaders,
      body: JSON.stringify({ managerReview: 'Unauthorized evaluation', rating: 3 }),
    });
    assert.equal(unauthorizedReviewSubmit.status, 403, 'Unrelated manager must not submit manager review');

    const validManagerSubmit = await request(`/performance/reviews/${reviewId}/manager-review`, {
      method: 'PUT',
      headers: managerHeaders,
      body: JSON.stringify({ managerReview: 'Exceeded target expectations.', rating: 5 }),
    });
    assert.equal(validManagerSubmit.status, 200, 'Assigned manager should submit review');
    assert.equal(validManagerSubmit.data.data.review.managerReview, 'Exceeded target expectations.');
    assert.equal(validManagerSubmit.data.data.review.rating, 5);

    console.log('Performance API integration tests passed: goals/KPIs, cycle eligibility, duplicate prevention, team scope, review permissions, and manager review submission.');
  } finally {
    await Review.deleteMany({ _id: { $in: reviews } });
    await PerformanceCycle.deleteMany({ _id: { $in: cycles } });
    await User.deleteMany({ _id: { $in: users } });
    await mongoose.disconnect();
  }
})().catch((error) => {
  console.error(`Performance API integration tests failed: ${error.message}`);
  process.exit(1);
});