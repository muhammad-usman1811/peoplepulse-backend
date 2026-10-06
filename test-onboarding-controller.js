const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Onboarding = require('./src/models/Onboarding');
const Candidate = require('./src/models/Candidate');
const Document = require('./src/models/Document');
const User = require('./src/models/User');
const Notification = require('./src/models/Notification');
const controller = require('./src/controllers/onboardingController');
const onboardingRoutes = require('./src/routes/onboardingRoutes');
const { triggerOnboardingForCandidate } = require('./src/utils/triggerOnboarding');

const originalMethods = {
  onboardingCreate: Onboarding.create,
  onboardingFind: Onboarding.find,
  onboardingFindOne: Onboarding.findOne,
  onboardingFindById: Onboarding.findById,
  onboardingCountDocuments: Onboarding.countDocuments,
  onboardingFindByIdAndUpdate: Onboarding.findByIdAndUpdate,
  onboardingFindByIdAndDelete: Onboarding.findByIdAndDelete,
  onboardingExists: Onboarding.exists,
  candidateExists: Candidate.exists,
  candidateFindById: Candidate.findById,
  candidateFindByIdAndUpdate: Candidate.findByIdAndUpdate,
  candidateUpdateMany: Candidate.updateMany,
  documentUpdateMany: Document.updateMany,
  userExists: User.exists,
  userFindOne: User.findOne,
  notificationCreate: Notification.create,
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
  Onboarding.create = originalMethods.onboardingCreate;
  Onboarding.find = originalMethods.onboardingFind;
  Onboarding.findOne = originalMethods.onboardingFindOne;
  Onboarding.findById = originalMethods.onboardingFindById;
  Onboarding.countDocuments = originalMethods.onboardingCountDocuments;
  Onboarding.findByIdAndUpdate = originalMethods.onboardingFindByIdAndUpdate;
  Onboarding.findByIdAndDelete = originalMethods.onboardingFindByIdAndDelete;
  Onboarding.exists = originalMethods.onboardingExists;
  Candidate.exists = originalMethods.candidateExists;
  Candidate.findById = originalMethods.candidateFindById;
  Candidate.findByIdAndUpdate = originalMethods.candidateFindByIdAndUpdate;
  Candidate.updateMany = originalMethods.candidateUpdateMany;
  Document.updateMany = originalMethods.documentUpdateMany;
  User.exists = originalMethods.userExists;
  User.findOne = originalMethods.userFindOne;
  Notification.create = originalMethods.notificationCreate;
});

test('onboarding creation requires either employee or candidate', async () => {
  const res = await runController(controller.createOnboarding, {
    body: { title: 'Test Checklist' },
    user: { _id: new mongoose.Types.ObjectId(), role: 'hr' },
  });
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, 'Either employee or candidate must be provided');
});

test('onboarding creation creates checklist with default tasks when tasks omitted', async () => {
  const candidateId = new mongoose.Types.ObjectId();
  Candidate.exists = async () => true;
  Onboarding.exists = async () => false;
  Candidate.findByIdAndUpdate = async () => ({ _id: candidateId });
  let createdData;
  Onboarding.create = async (data) => {
    createdData = data;
    return { _id: new mongoose.Types.ObjectId(), ...data };
  };

  const res = await runController(controller.createOnboarding, {
    body: { candidate: candidateId.toString() },
    user: { _id: new mongoose.Types.ObjectId(), role: 'hr' },
  });

  assert.equal(res.statusCode, 201);
  assert.equal(createdData.title, 'Onboarding Checklist');
  assert.equal(createdData.tasks.length, 5);
  assert.equal(createdData.tasks[0].category, 'Documentation');
});

test('onboarding list returns paginated checklists with status filter', async () => {
  Onboarding.countDocuments = async () => 1;
  Onboarding.find = () => ({
    sort: () => ({
      skip: () => ({
        limit: () => ({
          populate: () => ({
            populate: async () => [{ _id: new mongoose.Types.ObjectId(), title: 'Checklist 1' }],
          }),
        }),
      }),
    }),
  });

  const res = await runController(controller.getOnboardingList, {
    query: { page: '1', limit: '10', status: 'Pending' },
    user: { _id: new mongoose.Types.ObjectId(), role: 'hr' },
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.onboardings.length, 1);
  assert.equal(res.body.data.pagination.total, 1);
});

test('getMyOnboarding retrieves active checklist for authenticated employee', async () => {
  const userId = new mongoose.Types.ObjectId();
  Onboarding.findOne = () => ({
    sort: () => ({
      populate: () => ({
        populate: () => ({
          populate: () => ({
            populate: async () => ({ _id: new mongoose.Types.ObjectId(), title: 'My Checklist', employee: userId }),
          }),
        }),
      }),
    }),
  });

  const res = await runController(controller.getMyOnboarding, {
    user: { _id: userId, role: 'employee' },
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.onboarding.title, 'My Checklist');
});

test('getMyOnboarding populates task assignees and completers', async () => {
  const calls = [];
  const onboarding = { _id: new mongoose.Types.ObjectId(), title: 'Checklist' };
  Onboarding.findOne = () => ({
    sort: () => ({
      populate: (path) => {
        calls.push(path);
        return {
          populate: (nextPath) => {
            calls.push(nextPath);
            return {
              populate: (taskPath) => {
                calls.push(taskPath);
                return {
                  populate: async (completedPath) => {
                    calls.push(completedPath);
                    return onboarding;
                  },
                };
              },
            };
          },
        };
      },
    }),
  });
  const res = await runController(controller.getMyOnboarding, {
    user: { _id: new mongoose.Types.ObjectId(), role: 'employee' },
  });
  assert.equal(res.statusCode, 200);
  assert(calls.includes('tasks.assignedTo'));
  assert(calls.includes('tasks.completedBy'));
});

test('duplicate onboarding creation returns clear conflicts for candidates and employees', async (t) => {
  const employeeId = new mongoose.Types.ObjectId();
  const candidateId = new mongoose.Types.ObjectId();
  User.exists = async () => true;
  Candidate.exists = async () => true;
  for (const [name, body, duplicateFilter, expectedMessage] of [
    ['candidate', { candidate: candidateId.toString() }, { candidate: candidateId.toString() }, /checklist already exists for this candidate/i],
    ['employee', { employee: employeeId.toString() }, { employee: employeeId.toString(), status: { $nin: ['Completed', 'Cancelled'] } }, /active onboarding checklist already exists for this employee/i],
  ]) {
    await t.test(name, async () => {
      User.exists = async () => true;
      Candidate.exists = async () => true;
      Onboarding.exists = async (filter) => {
        assert.deepEqual(filter, duplicateFilter);
        return true;
      };
      const res = await runController(controller.createOnboarding, {
        body,
        user: { _id: new mongoose.Types.ObjectId(), role: 'hr' },
      });
      assert.equal(res.statusCode, 409);
      assert.match(res.body.message, expectedMessage);
    });
  }
});

test('completed or cancelled employee checklists do not block a replacement checklist', async () => {
  const employeeId = new mongoose.Types.ObjectId();
  User.exists = async () => true;
  Onboarding.exists = async (filter) => {
    assert.deepEqual(filter, {
      employee: employeeId.toString(),
      status: { $nin: ['Completed', 'Cancelled'] },
    });
    return false;
  };
  Onboarding.create = async (data) => ({ _id: new mongoose.Types.ObjectId(), ...data });
  const res = await runController(controller.createOnboarding, {
    body: { employee: employeeId.toString() },
    user: { _id: new mongoose.Types.ObjectId(), role: 'hr' },
  });
  assert.equal(res.statusCode, 201);
});

test('newly created completed tasks have completion metadata and set checklist status', async () => {
  const employeeId = new mongoose.Types.ObjectId();
  const actorId = new mongoose.Types.ObjectId();
  User.exists = async () => true;
  Onboarding.exists = async () => false;
  let created;
  Onboarding.create = async (data) => {
    created = data;
    return { _id: new mongoose.Types.ObjectId(), ...data };
  };
  const res = await runController(controller.createOnboarding, {
    body: {
      employee: employeeId.toString(),
      tasks: [
        { title: 'Completed task', status: 'Completed' },
        { title: 'Pending task', status: 'Pending' },
      ],
    },
    user: { _id: actorId, role: 'hr' },
  });
  assert.equal(res.statusCode, 201);
  assert.equal(created.status, 'In Progress');
  assert.equal(created.tasks[0].completedBy.toString(), actorId.toString());
  assert(created.tasks[0].completedAt);
  assert.equal(created.tasks[1].completedAt, undefined);
  assert.equal(created.completedAt, undefined);
});

test('completed checklist title edit preserves its completion timestamp', async () => {
  const onboardingId = new mongoose.Types.ObjectId();
  const completedAt = new Date('2026-01-02T03:04:05.000Z');
  const onboarding = {
    _id: onboardingId,
    title: 'Old title',
    status: 'Completed',
    completedAt,
    save: async function () { return this; },
  };
  Onboarding.findById = async () => onboarding;
  const res = await runController(controller.updateOnboarding, {
    params: { id: onboardingId.toString() },
    body: { title: 'New title' },
    user: { _id: new mongoose.Types.ObjectId(), role: 'hr' },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(onboarding.title, 'New title');
  assert.equal(onboarding.completedAt, completedAt);
});

test('deleting onboarding clears candidate and document references', async () => {
  const onboardingId = new mongoose.Types.ObjectId();
  const onboarding = { _id: onboardingId, title: 'Checklist' };
  let candidateUpdate;
  let documentUpdate;
  Onboarding.findByIdAndDelete = async () => onboarding;
  Candidate.updateMany = async (...args) => { candidateUpdate = args; };
  Document.updateMany = async (...args) => { documentUpdate = args; };
  const res = await runController(controller.deleteOnboarding, {
    params: { id: onboardingId.toString() },
    user: { _id: new mongoose.Types.ObjectId(), role: 'hr' },
  });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(candidateUpdate, [
    { onboarding: onboardingId.toString() },
    { $unset: { onboarding: 1 } },
  ]);
  assert.deepEqual(documentUpdate, [
    { onboarding: onboardingId.toString() },
    { $unset: { onboarding: 1 } },
  ]);
});

test('creating a task rejects an assigned user that does not exist', async () => {
  const onboardingId = new mongoose.Types.ObjectId();
  const assignedTo = new mongoose.Types.ObjectId();
  Onboarding.findById = async () => ({
    _id: onboardingId,
    status: 'In Progress',
    tasks: [],
    save: async function () { return this; },
  });
  User.exists = async () => false;
  const res = await runController(controller.addTask, {
    params: { id: onboardingId.toString() },
    body: { title: 'Task', assignedTo: assignedTo.toString() },
    user: { _id: new mongoose.Types.ObjectId(), role: 'hr' },
  });
  assert.equal(res.statusCode, 404);
  assert.equal(res.body.message, 'Assigned user not found');
});

test('task status update in onboarding checklist auto-updates overall status', async () => {
  const onboardingId = new mongoose.Types.ObjectId();
  const taskId = new mongoose.Types.ObjectId();
  const userId = new mongoose.Types.ObjectId();

  const mockTask = {
    _id: taskId,
    title: 'Upload CNIC',
    category: 'Documentation',
    status: 'Pending',
    assignedTo: userId,
  };

  const mockOnboarding = {
    _id: onboardingId,
    title: 'Onboarding Checklist',
    employee: userId,
    status: 'Pending',
    tasks: [mockTask],
    save: async function () { return this; },
  };
  mockOnboarding.tasks.id = (id) => (String(id) === String(taskId) ? mockTask : null);
  mockOnboarding.tasks.every = (fn) => [mockTask].every(fn);
  mockOnboarding.tasks.some = (fn) => [mockTask].some(fn);

  Onboarding.findById = async () => mockOnboarding;

  const res = await runController(controller.updateTask, {
    params: { id: onboardingId.toString(), taskId: taskId.toString() },
    body: { status: 'Completed' },
    user: { _id: userId, role: 'employee' },
  });

  assert.equal(res.statusCode, 200);
  assert.equal(mockTask.status, 'Completed');
  assert.equal(mockOnboarding.status, 'Completed');
  assert(mockTask.completedAt);
});

test('cancelled checklists cannot have tasks added, updated, or deleted', async (t) => {
  const onboardingId = new mongoose.Types.ObjectId();
  const taskId = new mongoose.Types.ObjectId();
  let saveCalled = false;
  const task = {
    _id: taskId,
    title: 'IT Setup',
    category: 'IT Setup',
    status: 'Pending',
  };
  const onboarding = {
    _id: onboardingId,
    employee: new mongoose.Types.ObjectId(),
    status: 'Cancelled',
    tasks: [task],
    save: async function () { saveCalled = true; return this; },
  };
  onboarding.tasks.id = (id) => (String(id) === String(taskId) ? task : null);
  onboarding.tasks.pull = () => { onboarding.tasks.length = 0; };
  for (const [operation, handler, req] of [
    ['add', controller.addTask, { params: { id: onboardingId.toString() }, body: { title: 'New task' } }],
    ['update', controller.updateTask, { params: { id: onboardingId.toString(), taskId: taskId.toString() }, body: { status: 'In Progress' } }],
    ['delete', controller.deleteTask, { params: { id: onboardingId.toString(), taskId: taskId.toString() }, body: {} }],
  ]) {
    await t.test(operation, async () => {
      Onboarding.findById = async () => onboarding;
      const res = await runController(handler, { ...req, user: { _id: onboarding.employee, role: 'hr' } });
      assert.equal(res.statusCode, 409);
      assert.match(res.body.message, /Cancelled onboarding/);
    });
  }
  assert.equal(saveCalled, false);
});

test('deleting the last pending task recomputes the onboarding as completed', async () => {
  const onboardingId = new mongoose.Types.ObjectId();
  const taskId = new mongoose.Types.ObjectId();
  const pendingTask = { _id: taskId, title: 'Pending task', status: 'Pending' };
  const completedTask = { _id: new mongoose.Types.ObjectId(), title: 'Done task', status: 'Completed' };
  const onboarding = {
    _id: onboardingId,
    status: 'In Progress',
    tasks: [pendingTask, completedTask],
    save: async function () { return this; },
  };
  onboarding.tasks.id = (id) => (String(id) === String(taskId) ? pendingTask : null);
  onboarding.tasks.pull = (id) => {
    const index = onboarding.tasks.findIndex((task) => String(task._id) === String(id));
    onboarding.tasks.splice(index, 1);
  };
  Onboarding.findById = async () => onboarding;

  const res = await runController(controller.deleteTask, {
    params: { id: onboardingId.toString(), taskId: taskId.toString() },
    user: { _id: new mongoose.Types.ObjectId(), role: 'hr' },
  });

  assert.equal(res.statusCode, 200);
  assert.equal(onboarding.status, 'Completed');
  assert(onboarding.completedAt);
});

test('employees can complete their General and Documentation tasks; IT and HR tasks need assigned staff', async (t) => {
  const onboardingId = new mongoose.Types.ObjectId();
  const employeeId = new mongoose.Types.ObjectId();
  const staffId = new mongoose.Types.ObjectId();
  const cases = [
    { category: 'Documentation', assignedTo: undefined, userId: employeeId, expected: 200 },
    { category: 'General', assignedTo: undefined, userId: employeeId, expected: 200 },
    { category: 'Training', assignedTo: undefined, userId: employeeId, expected: 403 },
    { category: 'IT Setup', assignedTo: staffId, userId: staffId, expected: 200 },
    { category: 'IT Setup', assignedTo: undefined, userId: employeeId, expected: 403 },
  ];

  for (const item of cases) {
    await t.test(item.category, async () => {
      const taskId = new mongoose.Types.ObjectId();
      const task = {
        _id: taskId,
        title: 'Complete work',
        category: item.category,
        status: 'Pending',
        assignedTo: item.assignedTo,
      };
      const onboarding = {
        _id: onboardingId,
        employee: employeeId,
        status: 'In Progress',
        tasks: [task],
        save: async function () { return this; },
      };
      onboarding.tasks.id = (id) => (String(id) === String(taskId) ? task : null);
      Onboarding.findById = async () => onboarding;

      const res = await runController(controller.updateTask, {
        params: { id: onboardingId.toString(), taskId: taskId.toString() },
        body: { status: 'Completed' },
        user: { _id: item.userId, role: 'employee' },
      });

      assert.equal(res.statusCode, item.expected);
      assert.equal(task.status, item.expected === 200 ? 'Completed' : 'Pending');
    });
  }
});

test('employees cannot reverse IT Setup or HR Orientation tasks completed by HR', async (t) => {
  const onboardingId = new mongoose.Types.ObjectId();
  const employeeId = new mongoose.Types.ObjectId();
  for (const category of ['IT Setup', 'HR Orientation']) {
    await t.test(category, async () => {
      const taskId = new mongoose.Types.ObjectId();
      const task = {
        _id: taskId,
        title: 'Completed by HR',
        category,
        status: 'Completed',
        completedBy: new mongoose.Types.ObjectId(),
      };
      const onboarding = {
        _id: onboardingId,
        employee: employeeId,
        status: 'In Progress',
        tasks: [task],
        save: async function () { return this; },
      };
      onboarding.tasks.id = (id) => (String(id) === String(taskId) ? task : null);
      Onboarding.findById = async () => onboarding;

      const res = await runController(controller.updateTask, {
        params: { id: onboardingId.toString(), taskId: taskId.toString() },
        body: { status: 'Pending' },
        user: { _id: employeeId, role: 'employee' },
      });

      assert.equal(res.statusCode, 403);
      assert.equal(task.status, 'Completed');
    });
  }
});

test('triggerCandidateOnboarding initializes checklist for candidate', async () => {
  const candidateId = new mongoose.Types.ObjectId();
  const candidateDoc = {
    _id: candidateId,
    name: 'Fahad Developer',
    email: 'fahad@example.test',
    stage: 'Offer',
    save: async function () { return this; },
  };

  Candidate.findById = async () => candidateDoc;
  Onboarding.findOne = async () => null;
  User.findOne = async () => null;
  Notification.create = async () => ({});
  Onboarding.create = async (data) => ({ _id: new mongoose.Types.ObjectId(), ...data });

  const res = await runController(controller.triggerCandidateOnboarding, {
    params: { candidateId: candidateId.toString() },
    user: { _id: new mongoose.Types.ObjectId(), role: 'hr' },
  });

  assert.equal(res.statusCode, 200);
  assert.equal(candidateDoc.stage, 'Hired');
  assert(res.body.data.onboarding);
});

test('triggerCandidateOnboarding marks candidate Hired when checklist already exists', async () => {
  const candidateId = new mongoose.Types.ObjectId();
  const onboardingId = new mongoose.Types.ObjectId();
  const candidateDoc = {
    _id: candidateId,
    name: 'Fahad Developer',
    email: 'fahad@example.test',
    stage: 'Offer',
    save: async function () { return this; },
  };
  const existingOnboarding = {
    _id: onboardingId,
    candidate: candidateId,
    save: async function () { return this; },
  };
  Candidate.findById = async () => candidateDoc;
  Onboarding.findOne = async () => existingOnboarding;
  User.findOne = async () => null;

  const res = await runController(controller.triggerCandidateOnboarding, {
    params: { candidateId: candidateId.toString() },
    user: { _id: new mongoose.Types.ObjectId(), role: 'hr' },
  });

  assert.equal(res.statusCode, 200);
  assert.equal(candidateDoc.stage, 'Hired');
  assert.equal(String(candidateDoc.onboarding), String(onboardingId));
  assert.equal(String(res.body.data.onboarding._id), String(onboardingId));
});

test('hire identity email is selected so existing checklist metadata is not redundantly written', async () => {
  const onboardingId = new mongoose.Types.ObjectId();
  const candidateId = new mongoose.Types.ObjectId();
  const candidate = {
    _id: candidateId,
    name: 'Alex Candidate',
    email: 'alex@example.test',
    stage: 'Hired',
    onboarding: onboardingId,
    save: async function () { throw new Error('candidate should not need another save'); },
  };
  let selectedProjection;
  Onboarding.findOne = (filter) => ({
    select(projection) {
      selectedProjection = projection;
      return Promise.resolve({
        _id: onboardingId,
        hireIdentityEmail: filter.hireIdentityEmail ? 'alex@example.test' : undefined,
      });
    },
  });
  User.findOne = async () => null;

  const result = await triggerOnboardingForCandidate(candidate);
  assert.equal(selectedProjection, '+hireIdentityEmail');
  assert.equal(String(result.onboarding._id), String(onboardingId));
});

test('retry after candidate save failure still syncs the hired stage', async () => {
  const candidateId = new mongoose.Types.ObjectId();
  const onboardingId = new mongoose.Types.ObjectId();
  let saveAttempts = 0;
  const candidate = {
    _id: candidateId,
    name: 'Fahad Developer',
    email: 'fahad@example.test',
    stage: 'Offer',
    save: async function () {
      saveAttempts += 1;
      if (saveAttempts === 1) throw new Error('temporary save failure');
      return this;
    },
  };
  Onboarding.findOne = async () => ({
    _id: onboardingId,
    hireIdentityEmail: 'fahad@example.test',
  });
  User.findOne = async () => null;

  await assert.rejects(triggerOnboardingForCandidate(candidate), /temporary save failure/);
  candidate.stage = 'Offer';
  candidate.onboarding = undefined;
  const handoff = await triggerOnboardingForCandidate(candidate);

  assert.equal(saveAttempts, 2);
  assert.equal(candidate.stage, 'Hired');
  assert.equal(String(candidate.onboarding), String(onboardingId));
  assert.equal(String(handoff.onboarding._id), String(onboardingId));
});

test('same email hires reuse one onboarding checklist across job applications', async () => {
  const first = {
    _id: new mongoose.Types.ObjectId(),
    name: 'Alex Candidate',
    email: 'alex@example.test',
    stage: 'Offer',
    save: async function () { return this; },
  };
  const second = {
    _id: new mongoose.Types.ObjectId(),
    name: 'Alex Candidate',
    email: 'alex@example.test',
    stage: 'Offer',
    save: async function () { return this; },
  };
  const onboarding = {
    _id: new mongoose.Types.ObjectId(),
    hireIdentityEmail: 'alex@example.test',
    save: async function () { return this; },
  };
  let createdCount = 0;
  Onboarding.findOne = async (filter) => {
    if (filter.hireIdentityEmail && createdCount > 0) return onboarding;
    return null;
  };
  Onboarding.create = async () => {
    createdCount += 1;
    return onboarding;
  };
  User.findOne = async () => null;

  const firstHire = await triggerOnboardingForCandidate(first);
  const secondHire = await triggerOnboardingForCandidate(second);

  assert.equal(createdCount, 1);
  assert.equal(String(first.onboarding), String(onboarding._id));
  assert.equal(String(second.onboarding), String(onboarding._id));
  assert.equal(String(firstHire.onboarding._id), String(secondHire.onboarding._id));
});

test('onboarding routes expose required endpoints', () => {
  const routes = onboardingRoutes.stack
    .filter((layer) => layer.route)
    .map((layer) => ({ path: layer.route.path, methods: Object.keys(layer.route.methods) }));

  assert(routes.some((r) => r.path === '/my-onboarding' && r.methods.includes('get')));
  assert(routes.some((r) => r.path === '/' && r.methods.includes('post')));
  assert(routes.some((r) => r.path === '/' && r.methods.includes('get')));
  assert(routes.some((r) => r.path === '/:id/tasks/:taskId' && r.methods.includes('patch')));
  assert(routes.some((r) => r.path === '/trigger-from-candidate/:candidateId' && r.methods.includes('post')));
});
