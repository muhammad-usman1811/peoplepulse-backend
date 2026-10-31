const test = require('node:test');
const assert = require('node:assert/strict');
const { DateTime } = require('luxon');
const validateQuery = require('./src/middleware/validateQuery');
const { APP_TIMEZONE } = require('./src/config/timezone');
const {
  attendanceExportQuerySchema,
  EXPORT_FORMAT_MESSAGE,
  EXPORT_DATE_MESSAGE,
  EXPORT_FUTURE_DATE_MESSAGE,
} = require('./src/validators/attendanceValidators');

const validate = validateQuery(attendanceExportQuerySchema);

// Runs the middleware against a minimal req/res and reports what it did.
const run = (query) => {
  const req = { query };
  const res = {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
  let nextCalled = false;
  validate(req, res, () => {
    nextCalled = true;
  });
  return { req, res, nextCalled };
};

const assertRejected = ({ res, nextCalled }, message) => {
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { success: false, message });
};

test('a valid csv or pdf request passes with the parsed query on req.validatedQuery', () => {
  for (const format of ['csv', 'pdf']) {
    const { req, res, nextCalled } = run({ format, date: '2026-10-23' });
    assert.equal(nextCalled, true);
    assert.equal(res.statusCode, null);
    assert.deepEqual(req.validatedQuery, { format, date: '2026-10-23' });
  }
});

test('leap day is accepted only in a leap year', () => {
  assert.equal(run({ format: 'csv', date: '2024-02-29' }).nextCalled, true);
  assertRejected(run({ format: 'csv', date: '2025-02-29' }), EXPORT_DATE_MESSAGE);
});

test('today is accepted but any later day is rejected, judged in APP_TIMEZONE', () => {
  const today = DateTime.now().setZone(APP_TIMEZONE);
  assert.equal(run({ format: 'csv', date: today.toISODate() }).nextCalled, true);
  for (const date of [today.plus({ days: 1 }).toISODate(), '2099-01-01']) {
    assertRejected(run({ format: 'pdf', date }), EXPORT_FUTURE_DATE_MESSAGE);
  }
});

test('an impossible date reports only the format problem, not the future-date one too', () => {
  for (const date of ['2099-13-45', '2099-02-31']) {
    assertRejected(run({ format: 'csv', date }), EXPORT_DATE_MESSAGE);
  }
});

test('page and limit are ignored and stripped', () => {
  const { req, nextCalled } = run({ format: 'pdf', date: '2026-10-23', page: 'abc', limit: '-5' });
  assert.equal(nextCalled, true);
  assert.deepEqual(req.validatedQuery, { format: 'pdf', date: '2026-10-23' });
});

test('a missing or unsupported format returns 400', () => {
  for (const format of [undefined, '', 'CSV', 'xlsx', ' csv', ['csv', 'pdf']]) {
    assertRejected(run({ format, date: '2026-10-23' }), EXPORT_FORMAT_MESSAGE);
  }
});

test('a missing, malformed, or impossible date returns 400', () => {
  for (const date of [
    undefined,
    '',
    '2026-02-31',
    '2026-13-01',
    '2026-00-10',
    '30-10-2026',
    '2026/10/23',
    '2026-1-05',
    '2026-10-23T00:00:00Z',
    ['2026-10-23', '2026-10-24'],
  ]) {
    assertRejected(run({ format: 'csv', date }), EXPORT_DATE_MESSAGE);
  }
});

test('when both fields are invalid both problems are reported in one message', () => {
  assertRejected(run({}), `${EXPORT_FORMAT_MESSAGE}; ${EXPORT_DATE_MESSAGE}`);
});
