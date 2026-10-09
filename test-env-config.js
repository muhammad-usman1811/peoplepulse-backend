const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeEnv } = require('./src/config/env');
const errorHandler = require('./src/middleware/errorMiddleware');
const AppError = require('./src/utils/appError');

const response = () => ({
  statusCode: 200,
  body: null,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});

test('normalizeEnv strips a UTF-8 BOM and whitespace from config values', () => {
  const env = normalizeEnv({
    NODE_ENV: '\uFEFFproduction',
    APP_TIMEZONE: ' Asia/Karachi\n',
    CLIENT_URL: '\uFEFFhttps://app.example.com,http://localhost:5173 ',
  });

  assert.equal(env.NODE_ENV, 'production');
  assert.equal(env.APP_TIMEZONE, 'Asia/Karachi');
  assert.equal(env.CLIENT_URL, 'https://app.example.com,http://localhost:5173');
});

test('normalizeEnv leaves secrets and keys byte-for-byte unchanged', () => {
  const secrets = {
    JWT_SECRET: '\uFEFFsecret with spaces ',
    ENCRYPTION_KEY: ' abc',
    SEARCH_INDEX_KEY: 'key\n',
    MONGO_URI: ' mongodb://x/y',
    EMAIL_PASS: ' pass ',
  };
  const env = normalizeEnv({ ...secrets });

  assert.deepEqual(env, secrets);
});

test('normalizeEnv ignores unset keys', () => {
  const env = normalizeEnv({});
  assert.equal('NODE_ENV' in env, false);
});

test('a BOM-prefixed NODE_ENV still hides stack traces once normalized', (t) => {
  const previous = process.env.NODE_ENV;
  t.after(() => { process.env.NODE_ENV = previous; });
  t.mock.method(console, 'error', () => {});

  process.env.NODE_ENV = '\uFEFFproduction';
  normalizeEnv();

  const req = { path: '/api/auth/login', is: () => false };

  const clientError = response();
  errorHandler(Object.assign(new Error('Unexpected end of JSON input'), { status: 400, expose: true }), req, clientError);
  assert.equal(clientError.statusCode, 400);
  assert.equal(clientError.body.message, 'Unexpected end of JSON input');
  assert.equal(clientError.body.error, undefined);

  const serverError = response();
  errorHandler(new Error('connection string leaked'), req, serverError);
  assert.equal(serverError.statusCode, 500);
  assert.equal(serverError.body.message, 'Internal Server Error');
  assert.equal(serverError.body.error, undefined);
});

test('production keeps AppError validation messages but hides server errors', (t) => {
  const previous = process.env.NODE_ENV;
  t.after(() => { process.env.NODE_ENV = previous; });
  t.mock.method(console, 'error', () => {});
  process.env.NODE_ENV = 'production';

  const req = { path: '/api/employees', is: () => false };

  // Thrown by validateReference/validateManager so the client can correct the field.
  const validation = response();
  errorHandler(new AppError('department does not exist', 400), req, validation);
  assert.equal(validation.statusCode, 400);
  assert.equal(validation.body.message, 'department does not exist');
  assert.equal(validation.body.error, undefined);

  // An AppError that is not a client error must not disclose its message.
  const internal = response();
  errorHandler(new AppError('mongodb://user:pass@host/db unreachable', 500), req, internal);
  assert.equal(internal.statusCode, 500);
  assert.equal(internal.body.message, 'Internal Server Error');

  // An unlabelled 4xx is not trusted either.
  const unlabelled = response();
  errorHandler(Object.assign(new Error('raw internal detail'), { statusCode: 400 }), req, unlabelled);
  assert.equal(unlabelled.statusCode, 400);
  assert.equal(unlabelled.body.message, 'Internal Server Error');
});
