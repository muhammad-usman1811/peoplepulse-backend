const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const express = require('express');
const mongoose = require('mongoose');
const User = require('./src/models/User');
const AuditLog = require('./src/models/AuditLog');
const authController = require('./src/controllers/authController');
const { protect, authorize } = require('./src/middleware/authMiddleware');
const { forgotPasswordLimiter } = require('./src/utils/rateLimiter');
const { hashToken } = require('./src/utils/cryptoUtils');
const { getTestMongoUri, isTestMongoUri } = require('./src/utils/testDatabase');

process.env.JWT_SECRET = 'auth-security-unit-test-secret';

const original = {
  findOne: User.findOne,
  findById: User.findById,
  record: AuditLog.record,
  createTransport: nodemailer.createTransport,
  emailUser: process.env.EMAIL_USER,
  emailPass: process.env.EMAIL_PASS,
  encryptionKey: process.env.ENCRYPTION_KEY,
  frontendUrl: process.env.FRONTEND_URL,
  nodeEnv: process.env.NODE_ENV,
  consoleError: console.error,
};

let sentMessage;
let capturedErrors;

const response = () => ({
  statusCode: 200,
  body: null,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});

const request = (body = {}, params = {}) => ({
  body,
  params,
  protocol: 'https',
  ip: '127.0.0.1',
  headers: {},
  get: () => 'api.example.test',
});

const runController = async (handler, req) => {
  const res = response();
  let nextError;
  await handler(req, res, (error) => { nextError = error; });
  if (nextError) throw nextError;
  return res;
};

const createUser = () => ({
  _id: new mongoose.Types.ObjectId(),
  email: 'employee@example.test',
  name: 'Test Employee',
  role: 'employee',
  isActive: true,
  tokenVersion: 0,
  resetPasswordToken: undefined,
  resetPasswordExpire: undefined,
  getResetPasswordToken() {
    const token = crypto.randomBytes(32).toString('hex');
    this.resetPasswordToken = hashToken(token);
    this.resetPasswordExpire = Date.now() + 30 * 60 * 1000;
    return token;
  },
  getSignedJwtToken() { return 'fresh-session-token'; },
  save: async () => {},
});

test.beforeEach(() => {
  sentMessage = null;
  capturedErrors = [];
  process.env.NODE_ENV = 'test';
  process.env.EMAIL_USER = 'test-smtp-user';
  process.env.EMAIL_PASS = 'test-smtp-password';
  process.env.FRONTEND_URL = 'https://frontend.example.test/app';
  AuditLog.record = async () => null;
  console.error = (...args) => capturedErrors.push(args.join(' '));
  nodemailer.createTransport = () => ({
    sendMail: async (message) => { sentMessage = message; return { messageId: 'test-message' }; },
  });
});

test.afterEach(() => {
  User.findOne = original.findOne;
  User.findById = original.findById;
  AuditLog.record = original.record;
  nodemailer.createTransport = original.createTransport;
  console.error = original.consoleError;
  if (original.emailUser === undefined) delete process.env.EMAIL_USER;
  else process.env.EMAIL_USER = original.emailUser;
  if (original.emailPass === undefined) delete process.env.EMAIL_PASS;
  else process.env.EMAIL_PASS = original.emailPass;
  if (original.encryptionKey === undefined) delete process.env.ENCRYPTION_KEY;
  else process.env.ENCRYPTION_KEY = original.encryptionKey;
  if (original.frontendUrl === undefined) delete process.env.FRONTEND_URL;
  else process.env.FRONTEND_URL = original.frontendUrl;
  if (original.nodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = original.nodeEnv;
});

test('known and unknown emails receive the same generic forgot-password response', async () => {
  User.findOne = async () => null;
  const unknown = await runController(authController.forgotPassword, request({ email: 'unknown@example.test' }));

  User.findOne = async () => createUser();
  const known = await runController(authController.forgotPassword, request({ email: 'employee@example.test' }));

  assert.deepEqual(known.body, unknown.body);
  assert.equal(known.statusCode, 200);
  assert.equal(sentMessage.to, 'employee@example.test');
  assert.match(sentMessage.html, /https:\/\/frontend\.example\.test\/app\/reset-password\.html\?token=/);
  assert.equal(known.body.data, undefined);
});

test('SMTP failure returns the generic response, clears the token, and logs no SMTP detail', async () => {
  const user = createUser();
  User.findOne = async () => user;
  nodemailer.createTransport = () => ({
    sendMail: async () => { throw new Error('private SMTP response'); },
  });
  let saves = 0;
  user.save = async () => { saves += 1; };

  const res = await runController(authController.forgotPassword, request({ email: user.email }));

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.message, 'If an account exists with that corporate email, a password reset link has been dispatched.');
  assert.equal(user.resetPasswordToken, undefined);
  assert.equal(user.resetPasswordExpire, undefined);
  assert.equal(saves, 2);
  assert.equal(capturedErrors.some((line) => line.includes('private SMTP response')), false);
});

test('missing SMTP configuration does not persist or expose a reset token', async () => {
  const user = createUser();
  User.findOne = async () => user;
  delete process.env.EMAIL_USER;
  delete process.env.EMAIL_PASS;

  const res = await runController(authController.forgotPassword, request({ email: user.email }));

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data, undefined);
  assert.equal(user.resetPasswordToken, undefined);
  assert.equal(user.resetPasswordExpire, undefined);
});

test('reset accepts a valid token, clears it, and revokes existing JWT sessions', async () => {
  const user = createUser();
  const rawToken = 'valid-reset-token';
  user.resetPasswordToken = hashToken(rawToken);
  user.resetPasswordExpire = Date.now() + 30_000;
  let query;
  User.findOne = async (value) => { query = value; return user; };
  let savedPassword;
  user.save = async () => { savedPassword = user.password; };

  const res = await runController(
    authController.resetPassword,
    request({ password: 'NewPassword123' }, { resetToken: rawToken })
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.token, 'fresh-session-token');
  assert.equal(query.resetPasswordToken, hashToken(rawToken));
  assert.ok(query.resetPasswordExpire.$gt <= Date.now());
  assert.equal(savedPassword, 'NewPassword123');
  assert.equal(user.tokenVersion, 1);
  assert.equal(user.resetPasswordToken, undefined);
  assert.equal(user.resetPasswordExpire, undefined);
});

test('reset tokens are cryptographically random, hashed at rest, and expire in 30 minutes', () => {
  const user = new User({ email: 'employee@example.test' });
  const firstToken = user.getResetPasswordToken();
  const firstHash = user.resetPasswordToken;
  const firstExpiry = user.resetPasswordExpire;
  const secondToken = user.getResetPasswordToken();

  assert.match(firstToken, /^[a-f0-9]{64}$/);
  assert.notEqual(firstToken, secondToken);
  assert.equal(firstHash, hashToken(firstToken));
  assert.notEqual(firstHash, firstToken);
  assert.ok(Math.abs(firstExpiry - (Date.now() + 30 * 60 * 1000)) < 1000);
});

test('encrypted names enforce the 120-character limit on plaintext', () => {
  process.env.ENCRYPTION_KEY = 'a'.repeat(64);
  const valid = new User({
    name: 'V'.repeat(120),
    email: 'long-name@example.test',
    password: 'TestPassword123',
  });
  assert.equal(valid.validateSync(), undefined);

  const tooLong = new User({
    name: 'V'.repeat(121),
    email: 'too-long-name@example.test',
    password: 'TestPassword123',
  });
  assert.ok(tooLong.validateSync().errors.name);
});

test('invalid, expired, and reused reset tokens are rejected', async (t) => {
  await t.test('invalid token', async () => {
    User.findOne = async () => null;
    const res = await runController(authController.resetPassword, request(
      { token: 'invalid-token', password: 'NewPassword123' }
    ));
    assert.equal(res.statusCode, 400);
  });

  await t.test('expired token', async () => {
    User.findOne = async () => null;
    const res = await runController(authController.resetPassword, request(
      { token: 'expired-token', password: 'NewPassword123' }
    ));
    assert.equal(res.statusCode, 400);
  });

  await t.test('reused token', async () => {
    User.findOne = async () => null;
    const res = await runController(authController.resetPassword, request(
      { token: 'already-used-token', password: 'NewPassword123' }
    ));
    assert.equal(res.statusCode, 400);
  });
});

test('middleware rejects an older session token after password reset', async () => {
  const userId = new mongoose.Types.ObjectId();
  const token = jwt.sign({ id: userId, tokenVersion: 0 }, process.env.JWT_SECRET);
  User.findById = async () => ({ _id: userId, isActive: true, tokenVersion: 1 });
  const req = { headers: { authorization: `Bearer ${token}` } };
  const res = response();
  let nextCalled = false;

  await protect(req, res, () => { nextCalled = true; });

  assert.equal(res.statusCode, 401);
  assert.equal(nextCalled, false);
});

test('auth middleware rejects missing tokens, inactive users, and client-forged roles', async (t) => {
  await t.test('missing token', async () => {
    const res = response();
    await protect({ headers: {} }, res, () => assert.fail('missing token must not continue'));
    assert.equal(res.statusCode, 401);
  });

  await t.test('deactivated user', async () => {
    const userId = new mongoose.Types.ObjectId();
    const token = jwt.sign({ id: userId, tokenVersion: 0 }, process.env.JWT_SECRET);
    User.findById = async () => ({ _id: userId, role: 'employee', isActive: false, tokenVersion: 0 });
    const res = response();
    await protect({ headers: { authorization: `Bearer ${token}` } }, res, () => assert.fail('inactive user must not continue'));
    assert.equal(res.statusCode, 403);
  });

  await t.test('client role does not override stored role', async () => {
    const userId = new mongoose.Types.ObjectId();
    const token = jwt.sign({ id: userId, role: 'admin', tokenVersion: 0 }, process.env.JWT_SECRET);
    User.findById = async () => ({ _id: userId, role: 'employee', isActive: true, tokenVersion: 0 });
    const req = { headers: { authorization: `Bearer ${token}` }, body: { role: 'admin' } };
    const res = response();
    let authenticated = false;
    await protect(req, res, () => { authenticated = true; });
    assert.equal(authenticated, true);
    authorize('admin')(req, res, () => assert.fail('stored employee role must not authorize admin action'));
    assert.equal(res.statusCode, 403);
  });
});

test('new password succeeds at login while the old password is rejected', async () => {
  const user = createUser();
  user.password = await bcrypt.hash('NewPassword123', 4);
  user.matchPassword = (password) => bcrypt.compare(password, user.password);
  User.findOne = () => ({ select: async () => user });

  const oldPasswordRes = await runController(authController.login, request({
    email: user.email,
    password: 'OldPassword123',
  }));
  assert.equal(oldPasswordRes.statusCode, 401);

  const newPasswordRes = await runController(authController.login, request({
    email: user.email,
    password: 'NewPassword123',
  }));
  assert.equal(newPasswordRes.statusCode, 200);
  assert.equal(newPasswordRes.body.data.token, 'fresh-session-token');
});

test('login runs a full-cost bcrypt compare for unknown emails so timing does not reveal accounts', async (t) => {
  const compared = [];
  const originalCompare = bcrypt.compare;
  bcrypt.compare = async (password, hash) => { compared.push({ password, hash }); return false; };
  t.after(() => { bcrypt.compare = originalCompare; });
  User.findOne = () => ({ select: async () => null });

  const res = await runController(authController.login, request({
    email: 'unknown@example.test',
    password: 'WrongPassword123',
  }));

  assert.equal(res.statusCode, 401);
  assert.equal(res.body.message, 'Invalid corporate email or password');
  assert.equal(compared.length, 1);
  assert.equal(compared[0].password, 'WrongPassword123');
  assert.match(compared[0].hash, /^\$2[aby]\$12\$/);
});

test('forgot-password per-email limiter blocks repeated requests', async () => {
  const req = {
    ip: '198.51.100.8',
    body: { email: `limit-${Date.now()}@example.test` },
  };
  for (let count = 0; count < 5; count += 1) {
    let nextCalled = false;
    forgotPasswordLimiter(req, { status() { return this; }, json() {} }, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
  }
  const res = response();
  forgotPasswordLimiter(req, res, () => assert.fail('rate-limited request must not continue'));
  assert.equal(res.statusCode, 429);
});

test('forgot and reset endpoints enforce independent IP rate limits', async (t) => {
  User.findOne = async () => null;
  const app = express();
  app.use(express.json());
  app.use('/api/auth', require('./src/routes/authRoutes'));
  app.use((error, req, res, next) => {
    capturedErrors.push(error.message);
    res.status(500).json({ message: error.message });
  });
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, () => resolve(listener));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}/api/auth`;

  try {
    await t.test('forgot password rate-limits many distinct addresses by IP', async () => {
      const responses = [];
      for (let index = 0; index < 21; index += 1) {
        responses.push(await fetch(`${baseUrl}/forgot-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: `person${index}@example.test` }),
        }));
      }
      assert.ok(responses.slice(0, 20).every((item) => item.status === 200));
      assert.equal(responses[20].status, 429);
    });

    await t.test('reset password has its own IP limit', async () => {
      User.findOne = async () => null;
      const results = [];
      for (let index = 0; index < 6; index += 1) {
        results.push(await fetch(`${baseUrl}/reset-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: `invalid-${index}`, password: 'NewPassword123' }),
        }));
      }
      assert.equal(results[0].status, 400, await results[0].text());
      assert.equal(results[5].status, 429, await results[5].text());
    });
  } finally {
    server.closeAllConnections();
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test('test database guard accepts only database names ending in _test', () => {
  assert.equal(isTestMongoUri('mongodb://localhost:27017/peoplepulse_test'), true);
  assert.equal(isTestMongoUri('mongodb+srv://host.example/peoplepulse_test?retryWrites=true'), true);
  assert.equal(isTestMongoUri('mongodb://localhost:27017/peoplepulse'), false);
  assert.equal(isTestMongoUri(''), false);

  const previousMode = process.env.NODE_ENV;
  const previousUri = process.env.MONGO_TEST_URI;
  process.env.NODE_ENV = 'test';
  process.env.MONGO_TEST_URI = 'mongodb://localhost:27017/peoplepulse_test';
  assert.equal(getTestMongoUri(), process.env.MONGO_TEST_URI);
  process.env.MONGO_TEST_URI = 'mongodb://localhost:27017/peoplepulse';
  assert.throws(() => getTestMongoUri(), /ends in _test/);
  if (previousMode === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = previousMode;
  if (previousUri === undefined) delete process.env.MONGO_TEST_URI;
  else process.env.MONGO_TEST_URI = previousUri;
});