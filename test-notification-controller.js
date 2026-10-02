const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Notification = require('./src/models/Notification');
const controller = require('./src/controllers/notificationController');

const original = {
  find: Notification.find,
  countDocuments: Notification.countDocuments,
  findOneAndUpdate: Notification.findOneAndUpdate,
  updateMany: Notification.updateMany,
};
const userId = new mongoose.Types.ObjectId();
const notificationId = new mongoose.Types.ObjectId();

const response = () => ({
  statusCode: 200,
  body: null,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});

const query = (value) => ({
  sort(value) { this.sortValue = value; return this; },
  skip(value) { this.skipValue = value; return this; },
  limit(value) { this.limitValue = value; return this; },
  then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); },
});

const runController = async (handler, req) => {
  const res = response();
  let nextError;
  await handler(req, res, (error) => { nextError = error; });
  if (nextError) throw nextError;
  return res;
};

test.afterEach(() => {
  Notification.find = original.find;
  Notification.countDocuments = original.countDocuments;
  Notification.findOneAndUpdate = original.findOneAndUpdate;
  Notification.updateMany = original.updateMany;
});

test('notification list filters by owner and unread state, newest first, paginated', async () => {
  let filter;
  let listQuery;
  Notification.find = (value) => { filter = value; return (listQuery = query([])); };
  Notification.countDocuments = async (value) => {
    assert.deepEqual(value, filter);
    return 0;
  };

  const res = await runController(controller.listNotifications, {
    query: { unread: 'true', page: '2', limit: '5' },
    user: { _id: userId },
  });

  assert.deepEqual(filter, { userId, readAt: null });
  assert.deepEqual(listQuery.sortValue, { createdAt: -1 });
  assert.equal(listQuery.skipValue, 5);
  assert.equal(listQuery.limitValue, 5);
  assert.deepEqual(res.body.data.pagination, { page: 2, limit: 5, total: 0, pages: 0 });
});

test('notification list rejects malformed unread filters', async () => {
  let queried = false;
  Notification.find = () => { queried = true; return query([]); };
  const res = await runController(controller.listNotifications, {
    query: { unread: 'yes' },
    user: { _id: userId },
  });

  assert.equal(res.statusCode, 400);
  assert.equal(queried, false);
});

test('mark-read only updates a notification belonging to the logged-in user', async () => {
  let filter;
  let update;
  Notification.findOneAndUpdate = async (queryFilter, queryUpdate) => {
    filter = queryFilter;
    update = queryUpdate;
    return { _id: notificationId, userId, readAt: new Date() };
  };

  const res = await runController(controller.markNotificationRead, {
    params: { id: String(notificationId) },
    user: { _id: userId },
  });

  assert.deepEqual(filter, { _id: String(notificationId), userId });
  assert.ok(update.$set.readAt instanceof Date);
  assert.equal(res.statusCode, 200);
});

test('mark-read returns 404 for another user notification', async () => {
  Notification.findOneAndUpdate = async () => null;
  const res = await runController(controller.markNotificationRead, {
    params: { id: String(notificationId) },
    user: { _id: userId },
  });
  assert.equal(res.statusCode, 404);
});

test('mark-all updates only unread notifications for the current user', async () => {
  let filter;
  Notification.updateMany = async (queryFilter, update) => {
    filter = queryFilter;
    assert.ok(update.$set.readAt instanceof Date);
    return { modifiedCount: 3 };
  };

  const res = await runController(controller.markAllNotificationsRead, { user: { _id: userId } });

  assert.deepEqual(filter, { userId, readAt: null });
  assert.equal(res.body.data.updatedCount, 3);
});