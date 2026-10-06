const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const User = require('./src/models/User');
const LeaveRequest = require('./src/models/LeaveRequest');
const WfhRequest = require('./src/models/WfhRequest');
const Notification = require('./src/models/Notification');
const AuditLog = require('./src/models/AuditLog');
const controller = require('./src/controllers/requestController');

const original = {
  userExists: User.exists,
  leaveExists: LeaveRequest.exists,
  leaveCreate: LeaveRequest.create,
  leaveFind: LeaveRequest.find,
  leaveFindOne: LeaveRequest.findOne,
  leaveFindOneAndUpdate: LeaveRequest.findOneAndUpdate,
  auditRecord: AuditLog.record,
  notificationCreate: Notification.create,
  consoleError: console.error,
  wfhExists: WfhRequest.exists,
  wfhCreate: WfhRequest.create,
  wfhFind: WfhRequest.find,
  wfhFindOne: WfhRequest.findOne,
  wfhFindOneAndUpdate: WfhRequest.findOneAndUpdate,
};

const ids = {
  employee: new mongoose.Types.ObjectId(),
  manager: new mongoose.Types.ObjectId(),
  unrelatedManager: new mongoose.Types.ObjectId(),
  request: new mongoose.Types.ObjectId(),
};

const response = () => ({
  statusCode: 200,
  body: null,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});

const query = (value) => ({
  populate() { return this; },
  sort() { return this; },
  then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); },
});

const runController = async (handler, req) => {
  const res = response();
  let nextError;
  await handler(req, res, (error) => { nextError = error; });
  if (nextError) throw nextError;
  return res;
};

const employeeRequest = (overrides = {}) => ({
  params: { id: ids.request.toString() },
  body: {},
  user: { _id: ids.employee, role: 'employee', manager: ids.manager },
  ...overrides,
});

const requestRecord = () => ({
  _id: ids.request,
  employee: { _id: ids.employee, name: 'Test Employee' },
  approver: { _id: ids.manager, name: 'Test Manager' },
  type: 'annual',
  startDate: new Date('2026-10-01T00:00:00.000Z'),
  endDate: new Date('2026-10-02T00:00:00.000Z'),
  status: 'pending',
  decisionNote: '',
});

test.afterEach(() => {
  User.exists = original.userExists;
  LeaveRequest.exists = original.leaveExists;
  LeaveRequest.create = original.leaveCreate;
  LeaveRequest.find = original.leaveFind;
  LeaveRequest.findOne = original.leaveFindOne;
  LeaveRequest.findOneAndUpdate = original.leaveFindOneAndUpdate;
  AuditLog.record = original.auditRecord;
  Notification.create = original.notificationCreate;
  console.error = original.consoleError;
  WfhRequest.exists = original.wfhExists;
  WfhRequest.create = original.wfhCreate;
  WfhRequest.find = original.wfhFind;
  WfhRequest.findOne = original.wfhFindOne;
  WfhRequest.findOneAndUpdate = original.wfhFindOneAndUpdate;
});

test('employees can only create their own requests and the current manager is assigned', async () => {
  let created;
  User.exists = async () => true;
  LeaveRequest.exists = async () => false;
  LeaveRequest.create = async (values) => {
    created = values;
    return { _id: ids.request };
  };
  LeaveRequest.findOne = () => query(requestRecord());

  const res = await runController(controller.leave.apply, employeeRequest({
    body: {
      employee: ids.unrelatedManager,
      type: 'annual',
      startDate: '2026-10-01',
      endDate: '2026-10-02',
    },
  }));

  assert.equal(res.statusCode, 201);
  assert.equal(String(created.employee), String(ids.employee));
  assert.equal(String(created.approver), String(ids.manager));
});

test('non-employees cannot submit leave or WFH requests', async (t) => {
  for (const [name, handler] of [['leave', controller.leave.apply], ['WFH', controller.wfh.apply]]) {
    await t.test(name, async () => {
      const res = await runController(handler, employeeRequest({
        user: { _id: ids.employee, role: 'hr', manager: ids.manager },
      }));
      assert.equal(res.statusCode, 403);
    });
  }
});

test('requests require an active manager and valid non-overlapping dates', async (t) => {
  await t.test('missing manager', async () => {
    const res = await runController(controller.leave.apply, employeeRequest({
      user: { _id: ids.employee, role: 'employee', manager: null },
    }));
    assert.equal(res.statusCode, 400);
  });

  await t.test('inactive manager', async () => {
    User.exists = async () => false;
    const res = await runController(controller.leave.apply, employeeRequest({ body: {
      type: 'annual', startDate: '2026-10-01', endDate: '2026-10-02',
    } }));
    assert.equal(res.statusCode, 400);
  });

  await t.test('invalid date range', async () => {
    User.exists = async () => true;
    const res = await runController(controller.leave.apply, employeeRequest({ body: {
      type: 'annual', startDate: '2026-10-03', endDate: '2026-10-01',
    } }));
    assert.equal(res.statusCode, 400);
  });

  await t.test('overlapping request', async () => {
    User.exists = async () => true;
    LeaveRequest.exists = async () => true;
    const res = await runController(controller.leave.apply, employeeRequest({ body: {
      type: 'sick', startDate: '2026-10-01', endDate: '2026-10-02',
    } }));
    assert.equal(res.statusCode, 409);
  });
});

test('only the assigned manager can decide a pending request', async (t) => {
  for (const [name, actor] of [
    ['unrelated manager', ids.unrelatedManager],
    ['employee', ids.employee],
  ]) {
    await t.test(name, async () => {
      let decisionFilter;
      LeaveRequest.findOneAndUpdate = async (filter) => {
        decisionFilter = filter;
        return null;
      };
      const res = await runController(controller.leave.approve, employeeRequest({
        body: {},
        user: { _id: actor, role: name === 'employee' ? 'employee' : 'admin' },
      }));
      assert.equal(res.statusCode, 404);
      assert.equal(String(decisionFilter.approver), String(actor));
      assert.equal(decisionFilter.status, 'pending');
    });
  }
});

test('a processed request cannot be decided again', async () => {
  let decisionFilter;
  LeaveRequest.findOneAndUpdate = async (filter) => {
    decisionFilter = filter;
    return null;
  };
  const res = await runController(controller.leave.approve, employeeRequest({
    body: {},
    user: { _id: ids.manager, role: 'admin' },
  }));

  assert.equal(res.statusCode, 404);
  assert.equal(decisionFilter.status, 'pending');
});

test('approving leave creates a notification for the employee', async () => {
  let notification;
  LeaveRequest.findOneAndUpdate = async (_filter, update) => ({
    ...requestRecord(),
    employee: ids.employee,
    ...update.$set,
  });
  LeaveRequest.findOne = () => query(requestRecord());
  AuditLog.record = async () => {};
  Notification.create = async (values) => {
    notification = new Notification(values);
    await notification.validate();
    return notification;
  };

  const res = await runController(controller.leave.approve, employeeRequest({
    user: { _id: ids.manager, role: 'admin' },
  }));

  assert.equal(res.statusCode, 200);
  assert.equal(String(notification.userId), String(ids.employee));
  assert.equal(notification.type, 'leave_approved');
  assert.match(notification.body, /annual leave request was approved/);
});

test('leave rejection notifies the employee with the decision note', async () => {
  let notification;
  LeaveRequest.findOneAndUpdate = async (_filter, update) => ({
    ...requestRecord(),
    employee: ids.employee,
    ...update.$set,
  });
  LeaveRequest.findOne = () => query(requestRecord());
  AuditLog.record = async () => {};
  Notification.create = async (values) => { notification = values; return values; };

  const res = await runController(controller.leave.reject, employeeRequest({
    body: { note: 'Please choose different dates.' },
    user: { _id: ids.manager, role: 'admin' },
  }));

  assert.equal(res.statusCode, 200);
  assert.equal(notification.type, 'leave_rejected');
  assert.match(notification.body, /Please choose different dates\./);
});

test('WFH approval and rejection notify the employee', async (t) => {
  for (const status of ['approved', 'rejected']) {
    await t.test(status, async () => {
      let notification;
      WfhRequest.findOneAndUpdate = async (_filter, update) => ({
        ...requestRecord(),
        employee: ids.employee,
        type: undefined,
        ...update.$set,
      });
      WfhRequest.findOne = () => query(requestRecord());
      AuditLog.record = async () => {};
      Notification.create = async (values) => {
        notification = new Notification(values);
        await notification.validate();
        return notification;
      };

      const res = await runController(controller.wfh[status === 'approved' ? 'approve' : 'reject'], employeeRequest({
        body: { note: 'Please coordinate with your team.' },
        user: { _id: ids.manager, role: 'admin' },
      }));

      assert.equal(res.statusCode, 200);
      assert.equal(notification.userId, ids.employee);
      assert.equal(notification.type, `wfh_${status}`);
      assert.equal(notification.title, `WFH request ${status}`);
      assert.match(notification.body, new RegExp(`Your WFH request was ${status}`));
      assert.match(notification.body, /Please coordinate with your team\./);
      assert.ok(notification instanceof Notification);
    });
  }
});

test('leave approval succeeds when notification delivery fails', async () => {
  let logArgs;
  LeaveRequest.findOneAndUpdate = async (_filter, update) => ({
    ...requestRecord(),
    employee: ids.employee,
    ...update.$set,
  });
  LeaveRequest.findOne = () => query({ ...requestRecord(), status: 'approved' });
  AuditLog.record = async () => {};
  Notification.create = async () => { throw new Error('notification database unavailable'); };
  console.error = (...args) => { logArgs = args; };

  const res = await runController(controller.leave.approve, employeeRequest({
    user: { _id: ids.manager, role: 'admin' },
  }));

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.request.status, 'approved');
  assert.equal(logArgs[1].userId, String(ids.employee));
  assert.equal(logArgs[1].type, 'leave_approved');
  assert.equal(logArgs[1].error, 'notification database unavailable');
});

test('employees can list only their own leave requests', async () => {
  let filter;
  LeaveRequest.find = (value) => {
    filter = value;
    return query([requestRecord()]);
  };
  const res = await runController(controller.leave.listMine, employeeRequest());

  assert.equal(String(filter.employee), String(ids.employee));
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.requests.length, 1);
});