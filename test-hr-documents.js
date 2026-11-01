const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const D = require('./src/models/HrDocument');
const U = require('./src/models/HrUpload');
const storagePath = require.resolve('./src/config/hrStorage');
const bucket = {};
require.cache[storagePath] = { id: storagePath, filename: storagePath, loaded: true, exports: () => bucket };
const c = require('./src/controllers/hrDocumentController');
const id = new mongoose.Types.ObjectId();
const filePath = 'policy/12345678-1234-4123-8123-123456789012-handbook.pdf';
const body = { originalName: 'Handbook.pdf', mimeType: 'application/pdf', size: 100, category: 'policy' };
async function run(handler, overrides = {}) {
  const req = { body: {}, query: {}, params: { id: String(id) }, user: { _id: id, role: 'hr' }, ...overrides };
  const res = { statusCode: 200, set() { return this; }, status(n) { this.statusCode = n; return this; }, json(b) { this.body = b; return this; } };
  await handler(req, res, err => { res.error = err; });
  return res;
}
test('company document security and storage flow', async t => {
  await t.test('reject invalid metadata and traversal', async () => {
    for (const patch of [{ size: 10485761 }, { size: 0 }, { originalName: '../a.pdf' }, { originalName: 'a.docx' }, { category: 'other' }]) {
      assert.equal((await run(c.uploadUrl, { body: { ...body, ...patch } })).statusCode, 400);
    }
  });
  await t.test('generate unique server paths and retain uploader receipt', async () => {
    const paths = [];
    bucket.createSignedUploadUrl = async p => { paths.push(p); return { data: { token: 'token', signedUrl: 'https://example/upload' } }; };
    U.create = async b => { assert.equal(b.uploadedBy, id); assert.equal(b.originalName, 'Handbook.pdf'); };
    assert.equal((await run(c.uploadUrl, { body })).body.token, 'token');
    await run(c.uploadUrl, { body });
    assert.notEqual(paths[0], paths[1]);
    assert.match(paths[0], /^policy\/.*-handbook.pdf$/);
  });
  await t.test('reject a path not issued to this uploader', async () => {
    U.findOne = async q => { assert.equal(q.uploadedBy, id); return null; };
    assert.equal((await run(c.create, { body: { title: 'Test', category: 'policy', filePath } })).statusCode, 400);
  });
  const confirm = { title: 'Test', category: 'policy', filePath };
  await t.test('verify actual storage metadata before creating record', async () => {
    U.findOne = async () => body;
    bucket.info = async () => ({ data: { size: 100, contentType: body.mimeType } });
    D.create = async b => ({ toObject: () => ({ ...b, _id: id }) });
    const res = await run(c.create, { body: confirm });
    assert.equal(res.statusCode, 201);
    assert.equal(res.body.filePath, undefined);
    bucket.info = async () => ({ data: { size: 10485761, contentType: body.mimeType } });
    assert.equal((await run(c.create, { body: confirm })).statusCode, 400);
    bucket.info = async () => ({ error: { statusCode: '404' } });
    assert.equal((await run(c.create, { body: confirm })).body.message, 'File not found in storage');
  });
  const doc = { _id: id, filePath, originalName: 'Handbook.pdf', mimeType: body.mimeType };
  D.findById = () => ({ select: async () => doc });
  await t.test('signed links expire in 60 seconds and DOCX has no preview', async () => {
    bucket.createSignedUrl = async (p, seconds, options) => {
      assert.equal(seconds, 60); assert.equal(p, filePath); assert.equal(options.download, 'Handbook.pdf');
      return { data: { signedUrl: 'https://example/signed' } };
    };
    assert.equal((await run(c.download)).body.expiresIn, 60);
    doc.mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    assert.equal((await run(c.preview)).statusCode, 400);
  });
  await t.test('storage failure preserves record; success deletes storage first', async () => {
    let deleted = false;
    D.deleteOne = async () => { deleted = true; };
    bucket.remove = async () => ({ error: new Error('storage failed') });
    assert.ok((await run(c.remove)).error);
    assert.equal(deleted, false);
    bucket.remove = async paths => { assert.deepEqual(paths, [filePath]); assert.equal(deleted, false); return {}; };
    assert.equal((await run(c.remove)).statusCode, 200);
    assert.equal(deleted, true);
  });
  await t.test('list hides storage paths and applies category filter', async () => {
    D.find = q => { assert.deepEqual(q, { category: 'policy' }); return { sort: () => ({ select: fields => {
      assert.ok(!fields.includes('filePath')); return { lean: async () => [{ _id: id, title: 'Test' }] };
    } }) }; };
    const res = await run(c.list, { query: { category: 'policy' } });
    assert.equal(res.body[0].id, String(id));
  });
  await t.test('write routes enforce HR/admin roles and all routes require login', () => {
    const r = require('./src/routes/hrDocumentRoutes');
    assert.equal(r.stack[0].handle.name, 'protect');
    const route = r.stack.find(s => s.route?.path === '/upload-url').route;
    for (const role of ['employee', 'superadmin']) {
      const res = { status(n) { this.code = n; return this; }, json() {} };
      route.stack[0].handle({ user: { role } }, res, () => assert.fail('unauthorized write'));
      assert.equal(res.code, 403);
    }
  });
});
