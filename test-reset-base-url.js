const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveResetBaseUrl, warnIfResetLinksUnavailable } = require('./src/utils/resetBaseUrl');

const REQUEST_ORIGIN = 'https://attacker-controlled-host.example';

test('an explicitly configured URL always wins', () => {
  assert.equal(
    resolveResetBaseUrl({ FRONTEND_URL: 'https://app.peoplepulse.com', NODE_ENV: 'production' }, REQUEST_ORIGIN),
    'https://app.peoplepulse.com'
  );
  assert.equal(
    resolveResetBaseUrl({ APP_URL: 'https://app.peoplepulse.com/', NODE_ENV: 'production' }, REQUEST_ORIGIN),
    'https://app.peoplepulse.com'
  );
  // FRONTEND_URL takes precedence over APP_URL.
  assert.equal(
    resolveResetBaseUrl({ FRONTEND_URL: 'https://a.example', APP_URL: 'https://b.example' }, ''),
    'https://a.example'
  );
});

test('production never trusts the request Host header', () => {
  const base = resolveResetBaseUrl({ NODE_ENV: 'production' }, REQUEST_ORIGIN);
  assert.equal(base, '', 'a forged Host must not end up in an emailed reset link');
});

test('production falls back to the platform deployment URL', () => {
  assert.equal(
    resolveResetBaseUrl({ NODE_ENV: 'production', VERCEL_PROJECT_PRODUCTION_URL: 'peoplepulse-backend.vercel.app' }, REQUEST_ORIGIN),
    'https://peoplepulse-backend.vercel.app'
  );
  // The stable production domain is preferred over the per-deployment URL.
  assert.equal(
    resolveResetBaseUrl({
      NODE_ENV: 'production',
      VERCEL_PROJECT_PRODUCTION_URL: 'peoplepulse-backend.vercel.app',
      VERCEL_URL: 'peoplepulse-backend-abc123.vercel.app',
    }, ''),
    'https://peoplepulse-backend.vercel.app'
  );
  assert.equal(
    resolveResetBaseUrl({ NODE_ENV: 'production', VERCEL_URL: 'peoplepulse-backend-abc123.vercel.app' }, ''),
    'https://peoplepulse-backend-abc123.vercel.app'
  );
});

test('outside production the request origin is still used', () => {
  assert.equal(resolveResetBaseUrl({ NODE_ENV: 'development' }, 'http://localhost:5000'), 'http://localhost:5000');
  assert.equal(resolveResetBaseUrl({}, 'http://localhost:5000'), 'http://localhost:5000');
});

test('unusable values resolve to no link rather than a broken one', () => {
  for (const env of [
    { NODE_ENV: 'production' },
    { FRONTEND_URL: 'not-a-url' },
    { FRONTEND_URL: 'ftp://files.example' },
    { FRONTEND_URL: 'javascript:alert(1)' },
    { FRONTEND_URL: '' },
  ]) {
    assert.equal(resolveResetBaseUrl(env, ''), '', `expected no base URL for ${JSON.stringify(env)}`);
  }
});

test('startup warns when production cannot send reset links', () => {
  const lines = [];
  const log = (line) => lines.push(line);

  assert.equal(warnIfResetLinksUnavailable({ NODE_ENV: 'production' }, log), true);
  assert.match(lines[0], /FRONTEND_URL/);
  assert.match(lines[0], /EMAIL_USER/);

  // Fully configured production stays quiet.
  lines.length = 0;
  assert.equal(
    warnIfResetLinksUnavailable(
      { NODE_ENV: 'production', FRONTEND_URL: 'https://app.peoplepulse.com', EMAIL_USER: 'a@b.c', EMAIL_PASS: 'x' },
      log
    ),
    false
  );
  assert.deepEqual(lines, []);

  // Development is not warned about, since it falls back to the request origin.
  assert.equal(warnIfResetLinksUnavailable({ NODE_ENV: 'development' }, log), false);
});
