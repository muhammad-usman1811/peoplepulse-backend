const mongoose = require('mongoose');
const Onboarding = require('../models/Onboarding');
const Candidate = require('../models/Candidate');
const User = require('../models/User');
const Document = require('../models/Document');
const ApiResponse = require('../utils/apiResponse');
const recordAudit = require('../utils/recordAudit');
const { triggerOnboardingForCandidate, DEFAULT_ONBOARDING_TASKS } = require('../utils/triggerOnboarding');
const { parsePositiveInteger } = require('../utils/pagination');

const validCategories = ['Documentation', 'IT Setup', 'HR Orientation', 'Training', 'General'];
const validTaskStatuses = ['Pending', 'In Progress', 'Completed'];
const validOnboardingStatuses = ['Pending', 'In Progress', 'Completed', 'Cancelled'];

const syncOnboardingStatus = (onboarding) => {
  if (onboarding.status === 'Cancelled') return;

  const allCompleted = onboarding.tasks.length > 0
    && onboarding.tasks.every((task) => task.status === 'Completed');
  const allPending = onboarding.tasks.every((task) => task.status === 'Pending');

  if (allCompleted) {
    onboarding.status = 'Completed';
    onboarding.completedAt = onboarding.completedAt || new Date();
  } else if (allPending) {
    onboarding.status = 'Pending';
    onboarding.completedAt = undefined;
  } else {
    onboarding.status = 'In Progress';
    onboarding.completedAt = undefined;
  }
};

exports.createOnboarding = async (req, res, next) => {
  try {
    const { title, employee, candidate, tasks, targetCompletionDate } = req.body;

    if (employee && !mongoose.isValidObjectId(employee)) {
      return ApiResponse.error(res, 'employee must be a valid User ID', null, 400);
    }
    if (candidate && !mongoose.isValidObjectId(candidate)) {
      return ApiResponse.error(res, 'candidate must be a valid Candidate ID', null, 400);
    }
    if (!employee && !candidate) {
      return ApiResponse.error(res, 'Either employee or candidate must be provided', null, 400);
    }

    if (targetCompletionDate !== undefined && targetCompletionDate !== null && targetCompletionDate !== '') {
      if (isNaN(new Date(targetCompletionDate).getTime())) {
        return ApiResponse.error(res, 'Invalid date provided for targetCompletionDate', null, 400);
      }
    }

    if (employee && !(await User.exists({ _id: employee }))) {
      return ApiResponse.error(res, 'Employee user not found', null, 404);
    }
    if (candidate && !(await Candidate.exists({ _id: candidate }))) {
      return ApiResponse.error(res, 'Candidate not found', null, 404);
    }
    if (employee && await Onboarding.exists({
      employee,
      status: { $nin: ['Completed', 'Cancelled'] },
    })) {
      return ApiResponse.error(res, 'An active onboarding checklist already exists for this employee', null, 409);
    }
    if (candidate && await Onboarding.exists({ candidate })) {
      return ApiResponse.error(res, 'An onboarding checklist already exists for this candidate', null, 409);
    }

    const safeTasks = Array.isArray(tasks)
      ? tasks.filter((t) => t && typeof t === 'object')
      : [];

    for (const t of safeTasks) {
      if (
        t.documentRequirement !== undefined
        && !['identityDocuments', 'employmentDocuments'].includes(t.documentRequirement)
      ) {
        return ApiResponse.error(res, 'documentRequirement must be identityDocuments or employmentDocuments', null, 400);
      }
      if (t.documentRequirement && t.category !== 'Documentation') {
        return ApiResponse.error(res, 'documentRequirement can only be used with Documentation tasks', null, 400);
      }
      if (t.dueDate !== undefined && t.dueDate !== null && t.dueDate !== '') {
        if (isNaN(new Date(t.dueDate).getTime())) {
          return ApiResponse.error(res, 'Invalid date provided for task dueDate', null, 400);
        }
      }
      if (t.assignedTo !== undefined && t.assignedTo !== null && t.assignedTo !== '') {
        if (!mongoose.isValidObjectId(t.assignedTo)) {
          return ApiResponse.error(res, 'assignedTo must be a valid User ID', null, 400);
        }
        if (!(await User.exists({ _id: t.assignedTo }))) {
          return ApiResponse.error(res, 'Assigned user not found', null, 404);
        }
      }
    }

    const formattedTasks = safeTasks.length > 0
      ? safeTasks.map((t) => ({
          title: typeof t.title === 'string' && t.title.trim() ? t.title.trim() : 'Task',
          description: typeof t.description === 'string' ? t.description.trim() : '',
          category: validCategories.includes(t.category) ? t.category : 'General',
          documentRequirement: t.documentRequirement,
          status: validTaskStatuses.includes(t.status) ? t.status : 'Pending',
          dueDate: t.dueDate ? new Date(t.dueDate) : undefined,
          assignedTo: t.assignedTo || undefined,
          completedAt: t.status === 'Completed' ? new Date() : undefined,
          completedBy: t.status === 'Completed' ? req.user._id : undefined,
        }))
      : DEFAULT_ONBOARDING_TASKS;
    const hasTasks = formattedTasks.length > 0;
    const allTasksCompleted = hasTasks && formattedTasks.every((task) => task.status === 'Completed');
    const allTasksPending = formattedTasks.every((task) => task.status === 'Pending');
    const onboardingStatus = allTasksCompleted ? 'Completed' : allTasksPending ? 'Pending' : 'In Progress';

    const onboardingTitle = typeof title === 'string' && title.trim()
      ? title.trim()
      : 'Onboarding Checklist';

    const onboarding = await Onboarding.create({
      title: onboardingTitle,
      employee: employee || undefined,
      candidate: candidate || undefined,
      tasks: formattedTasks,
      status: onboardingStatus,
      completedAt: allTasksCompleted ? new Date() : undefined,
      targetCompletionDate: targetCompletionDate ? new Date(targetCompletionDate) : undefined,
      startedAt: new Date(),
    });

    if (candidate) {
      await Candidate.findByIdAndUpdate(candidate, { onboarding: onboarding._id });
    }

    recordAudit({
      req,
      action: 'CREATE',
      resource: 'Onboarding',
      resourceId: onboarding._id,
      meta: { title: onboarding.title, employee, candidate, tasksCount: formattedTasks.length },
    });

    return ApiResponse.success(res, 'Onboarding checklist created successfully', { onboarding }, 201);
  } catch (err) {
    next(err);
  }
};

exports.getOnboardingList = async (req, res, next) => {
  try {
    const page = parsePositiveInteger(req.query.page, 1);
    const limit = parsePositiveInteger(req.query.limit, 10, 100);
    if (page === null || limit === null) {
      return ApiResponse.error(res, 'page must be a positive integer and limit must be an integer between 1 and 100', null, 400);
    }

    const filter = {};
    if (req.query.status) {
      if (!validOnboardingStatuses.includes(req.query.status)) {
        return ApiResponse.error(res, `status must be one of: ${validOnboardingStatuses.join(', ')}`, null, 400);
      }
      filter.status = req.query.status;
    }
    if (req.query.employee) {
      if (!mongoose.isValidObjectId(req.query.employee)) {
        return ApiResponse.error(res, 'employee must be a valid User ID', null, 400);
      }
      filter.employee = req.query.employee;
    }
    if (req.query.candidate) {
      if (!mongoose.isValidObjectId(req.query.candidate)) {
        return ApiResponse.error(res, 'candidate must be a valid Candidate ID', null, 400);
      }
      filter.candidate = req.query.candidate;
    }

    const [total, onboardings] = await Promise.all([
      Onboarding.countDocuments(filter),
      Onboarding.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('employee', 'name email employeeId department designation')
        .populate('candidate', 'name email stage'),
    ]);

    return ApiResponse.success(res, 'Onboarding checklists retrieved successfully', {
      onboardings,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
};

exports.getMyOnboarding = async (req, res, next) => {
  try {
    const onboarding = await Onboarding.findOne({ employee: req.user._id })
      .sort({ createdAt: -1 })
      .populate('employee', 'name email employeeId department designation')
      .populate('candidate', 'name email stage')
      .populate('tasks.assignedTo', 'name email')
      .populate('tasks.completedBy', 'name email');

    if (!onboarding) {
      return ApiResponse.error(res, 'No onboarding checklist found for current user', null, 404);
    }

    return ApiResponse.success(res, 'My onboarding checklist retrieved successfully', { onboarding });
  } catch (err) {
    next(err);
  }
};

exports.getOnboardingById = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return ApiResponse.error(res, 'Onboarding checklist not found', null, 404);
    }

    const onboarding = await Onboarding.findById(req.params.id)
      .populate('employee', 'name email employeeId department designation')
      .populate('candidate', 'name email stage')
      .populate('tasks.assignedTo', 'name email')
      .populate('tasks.completedBy', 'name email');

    if (!onboarding) {
      return ApiResponse.error(res, 'Onboarding checklist not found', null, 404);
    }

    const isHrOrAdmin = ['superadmin', 'admin', 'hr'].includes(req.user.role);
    const isOwner = onboarding.employee && String(onboarding.employee._id || onboarding.employee) === String(req.user._id);

    if (!isHrOrAdmin && !isOwner) {
      return ApiResponse.error(res, 'Not authorized to view this onboarding checklist', null, 403);
    }

    return ApiResponse.success(res, 'Onboarding checklist retrieved successfully', { onboarding });
  } catch (err) {
    next(err);
  }
};

exports.updateOnboarding = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return ApiResponse.error(res, 'Onboarding checklist not found', null, 404);
    }

    const onboarding = await Onboarding.findById(req.params.id);
    if (!onboarding) return ApiResponse.error(res, 'Onboarding checklist not found', null, 404);

    const { title, status, targetCompletionDate } = req.body;

    if (title !== undefined) {
      if (typeof title !== 'string' || !title.trim()) {
        return ApiResponse.error(res, 'title cannot be empty', null, 400);
      }
      onboarding.title = title.trim();
    }

    if (status !== undefined) {
      if (!validOnboardingStatuses.includes(status)) {
        return ApiResponse.error(res, `status must be one of: ${validOnboardingStatuses.join(', ')}`, null, 400);
      }
      // BUG-4 FIX: Block manual Completed if any tasks are still pending.
      // (syncOnboardingStatus from task updates will correct it automatically;
      // this only guards the direct PATCH /onboarding/:id endpoint.)
      if (status === 'Completed') {
        const hasPending = onboarding.tasks.some(
          (t) => t.status !== 'Completed'
        );
        if (hasPending) {
          return ApiResponse.error(
            res,
            'Cannot mark onboarding as Completed while tasks are still pending or in progress',
            null,
            409
          );
        }
      }
      const wasCompleted = onboarding.status === 'Completed';
      onboarding.status = status;
      if (status === 'Completed' && !wasCompleted) {
        onboarding.completedAt = onboarding.completedAt || new Date();
      } else if (status !== 'Completed') {
        onboarding.completedAt = undefined;
      }
    }

    if (targetCompletionDate !== undefined) {
      if (targetCompletionDate && isNaN(new Date(targetCompletionDate).getTime())) {
        return ApiResponse.error(res, 'Invalid date provided for targetCompletionDate', null, 400);
      }
      onboarding.targetCompletionDate = targetCompletionDate ? new Date(targetCompletionDate) : null;
    }

    await onboarding.save();

    recordAudit({
      req,
      action: 'UPDATE',
      resource: 'Onboarding',
      resourceId: onboarding._id,
      meta: { title: onboarding.title, status: onboarding.status },
    });

    return ApiResponse.success(res, 'Onboarding checklist updated successfully', { onboarding });
  } catch (err) {
    next(err);
  }
};

exports.deleteOnboarding = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return ApiResponse.error(res, 'Onboarding checklist not found', null, 404);
    }

    const onboarding = await Onboarding.findByIdAndDelete(req.params.id);
    if (!onboarding) return ApiResponse.error(res, 'Onboarding checklist not found', null, 404);

    await Promise.all([
      Candidate.updateMany({ onboarding: req.params.id }, { $unset: { onboarding: 1 } }),
      Document.updateMany(
        { onboarding: req.params.id },
        { $unset: { onboarding: 1 } }
      ),
    ]);

    recordAudit({
      req,
      action: 'DELETE',
      resource: 'Onboarding',
      resourceId: req.params.id,
      meta: { title: onboarding.title },
    });

    return ApiResponse.success(res, 'Onboarding checklist deleted successfully', { id: req.params.id });
  } catch (err) {
    next(err);
  }
};

exports.addTask = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return ApiResponse.error(res, 'Onboarding checklist not found', null, 404);
    }

    const onboarding = await Onboarding.findById(req.params.id);
    if (!onboarding) return ApiResponse.error(res, 'Onboarding checklist not found', null, 404);
    if (onboarding.status === 'Cancelled') {
      return ApiResponse.error(res, 'Cancelled onboarding checklists cannot be modified', null, 409);
    }

    const { title, description, category, dueDate, assignedTo, documentRequirement } = req.body;
    if (typeof title !== 'string' || !title.trim()) {
      return ApiResponse.error(res, 'task title is required', null, 400);
    }

    if (category && !validCategories.includes(category)) {
      return ApiResponse.error(res, `category must be one of: ${validCategories.join(', ')}`, null, 400);
    }
    if (documentRequirement !== undefined && !['identityDocuments', 'employmentDocuments'].includes(documentRequirement)) {
      return ApiResponse.error(res, 'documentRequirement must be identityDocuments or employmentDocuments', null, 400);
    }
    if (documentRequirement && (category || 'General') !== 'Documentation') {
      return ApiResponse.error(res, 'documentRequirement can only be used with Documentation tasks', null, 400);
    }

    if (assignedTo && !mongoose.isValidObjectId(assignedTo)) {
      return ApiResponse.error(res, 'assignedTo must be a valid User ID', null, 400);
    }
    if (assignedTo && !(await User.exists({ _id: assignedTo }))) {
      return ApiResponse.error(res, 'Assigned user not found', null, 404);
    }

    if (dueDate && isNaN(new Date(dueDate).getTime())) {
      return ApiResponse.error(res, 'Invalid date provided for task dueDate', null, 400);
    }

    const newTask = {
      title: title.trim(),
      description: typeof description === 'string' ? description.trim() : '',
      category: category || 'General',
      documentRequirement,
      status: 'Pending',
      dueDate: dueDate ? new Date(dueDate) : undefined,
      assignedTo: assignedTo || undefined,
    };

    onboarding.tasks.push(newTask);
    if (onboarding.status === 'Completed') {
      onboarding.status = 'In Progress';
      onboarding.completedAt = undefined;
    }
    await onboarding.save();

    const addedTask = onboarding.tasks[onboarding.tasks.length - 1];

    recordAudit({
      req,
      action: 'UPDATE',
      resource: 'Onboarding',
      resourceId: onboarding._id,
      meta: { actionType: 'ADD_TASK', taskTitle: addedTask.title },
    });

    return ApiResponse.success(res, 'Task added to onboarding checklist successfully', { onboarding, task: addedTask }, 201);
  } catch (err) {
    next(err);
  }
};

exports.updateTask = async (req, res, next) => {
  try {
    const { id, taskId } = req.params;
    if (!mongoose.isValidObjectId(id) || !mongoose.isValidObjectId(taskId)) {
      return ApiResponse.error(res, 'Onboarding checklist or task not found', null, 404);
    }

    const onboarding = await Onboarding.findById(id);
    if (!onboarding) return ApiResponse.error(res, 'Onboarding checklist not found', null, 404);

    const task = onboarding.tasks.id(taskId);
    if (!task) return ApiResponse.error(res, 'Task not found in onboarding checklist', null, 404);

    const isHrOrAdmin = ['superadmin', 'admin', 'hr'].includes(req.user.role);
    const isOwner = onboarding.employee && String(onboarding.employee) === String(req.user._id);
    const isAssigned = task.assignedTo && String(task.assignedTo) === String(req.user._id);

    if (!isHrOrAdmin && !isOwner && !isAssigned) {
      return ApiResponse.error(res, 'Not authorized to update this task', null, 403);
    }
    if (onboarding.status === 'Cancelled') {
      return ApiResponse.error(res, 'Cancelled onboarding checklists cannot be modified', null, 409);
    }

    const { title, description, category, status, dueDate, assignedTo } = req.body;

    if (!isHrOrAdmin) {
      if (title !== undefined || description !== undefined || category !== undefined || dueDate !== undefined || assignedTo !== undefined) {
        return ApiResponse.error(res, 'Non-HR users can only update task status', null, 403);
      }
      const ownerCanComplete = isOwner
        && ['General', 'Documentation'].includes(task.category);
      if (status === 'Completed' && !isAssigned && !ownerCanComplete) {
        return ApiResponse.error(res, 'Only HR/Admin, the employee for General or Documentation tasks, or assigned staff can complete this task', null, 403);
      }
      if (task.status === 'Completed' && status !== undefined && status !== 'Completed') {
        return ApiResponse.error(res, 'Only HR/Admin can change a completed task status', null, 403);
      }
    }

    if (title !== undefined && isHrOrAdmin) {
      if (typeof title !== 'string' || !title.trim()) {
        return ApiResponse.error(res, 'task title cannot be empty', null, 400);
      }
      task.title = title.trim();
    }
    if (description !== undefined && isHrOrAdmin) {
      task.description = typeof description === 'string' ? description.trim() : '';
    }
    if (category !== undefined && isHrOrAdmin) {
      if (!validCategories.includes(category)) {
        return ApiResponse.error(res, `category must be one of: ${validCategories.join(', ')}`, null, 400);
      }
      task.category = category;
      if (category !== 'Documentation' && req.body.documentRequirement === undefined) {
        task.documentRequirement = undefined;
      }
    }
    if (req.body.documentRequirement !== undefined && isHrOrAdmin) {
      if (!['identityDocuments', 'employmentDocuments', null, ''].includes(req.body.documentRequirement)) {
        return ApiResponse.error(res, 'documentRequirement must be identityDocuments or employmentDocuments', null, 400);
      }
      if (req.body.documentRequirement && (category || task.category) !== 'Documentation') {
        return ApiResponse.error(res, 'documentRequirement can only be used with Documentation tasks', null, 400);
      }
      task.documentRequirement = req.body.documentRequirement || undefined;
    }
    if (status !== undefined) {
      if (!validTaskStatuses.includes(status)) {
        return ApiResponse.error(res, `status must be one of: ${validTaskStatuses.join(', ')}`, null, 400);
      }
      if (status === 'Completed') {
        // BUG-5 FIX: Do NOT overwrite completedAt/completedBy if task is already
        // Completed. Idempotent re-submission should preserve the original timestamp.
        if (task.status !== 'Completed') {
          task.completedAt = new Date();
          task.completedBy = req.user._id;
          task.completedByDocument = undefined;
        }
      } else {
        task.completedAt = undefined;
        task.completedBy = undefined;
        task.completedByDocument = undefined;
      }
      task.status = status;
    }
    if (dueDate !== undefined && isHrOrAdmin) {
      if (dueDate && isNaN(new Date(dueDate).getTime())) {
        return ApiResponse.error(res, 'Invalid date provided for task dueDate', null, 400);
      }
      task.dueDate = dueDate ? new Date(dueDate) : undefined;
    }
    if (assignedTo !== undefined && isHrOrAdmin) {
      if (assignedTo && !mongoose.isValidObjectId(assignedTo)) {
        return ApiResponse.error(res, 'assignedTo must be a valid User ID', null, 400);
      }
      if (assignedTo && !(await User.exists({ _id: assignedTo }))) {
        return ApiResponse.error(res, 'Assigned user not found', null, 404);
      }
      task.assignedTo = assignedTo || undefined;
    }

    syncOnboardingStatus(onboarding);

    await onboarding.save();

    recordAudit({
      req,
      action: 'UPDATE',
      resource: 'Onboarding',
      resourceId: onboarding._id,
      meta: { actionType: 'UPDATE_TASK', taskId, taskTitle: task.title, status: task.status },
    });

    return ApiResponse.success(res, 'Task updated successfully', { onboarding, task });
  } catch (err) {
    next(err);
  }
};

exports.deleteTask = async (req, res, next) => {
  try {
    const { id, taskId } = req.params;
    if (!mongoose.isValidObjectId(id) || !mongoose.isValidObjectId(taskId)) {
      return ApiResponse.error(res, 'Onboarding checklist or task not found', null, 404);
    }

    const onboarding = await Onboarding.findById(id);
    if (!onboarding) return ApiResponse.error(res, 'Onboarding checklist not found', null, 404);
    if (onboarding.status === 'Cancelled') {
      return ApiResponse.error(res, 'Cancelled onboarding checklists cannot be modified', null, 409);
    }

    const task = onboarding.tasks.id(taskId);
    if (!task) return ApiResponse.error(res, 'Task not found in onboarding checklist', null, 404);

    onboarding.tasks.pull(taskId);
    syncOnboardingStatus(onboarding);
    await onboarding.save();

    recordAudit({
      req,
      action: 'UPDATE',
      resource: 'Onboarding',
      resourceId: onboarding._id,
      meta: { actionType: 'DELETE_TASK', taskId },
    });

    return ApiResponse.success(res, 'Task deleted successfully', { onboarding });
  } catch (err) {
    next(err);
  }
};

exports.triggerCandidateOnboarding = async (req, res, next) => {
  try {
    const { candidateId } = req.params;
    if (!mongoose.isValidObjectId(candidateId)) {
      return ApiResponse.error(res, 'Candidate not found', null, 404);
    }

    const candidate = await Candidate.findById(candidateId);
    if (!candidate) return ApiResponse.error(res, 'Candidate not found', null, 404);
    if (candidate.stage !== 'Offer' && candidate.stage !== 'Hired') {
      return ApiResponse.error(res, 'Candidates must reach Offer before onboarding can be triggered', null, 409);
    }

    const handoff = await triggerOnboardingForCandidate(candidate, req.user, req);

    // BUG-3: Be explicit — this endpoint moves the candidate to Hired stage.
    // The route name (trigger-from-candidate) was confusing; message now says so.
    return ApiResponse.success(
      res,
      'Candidate moved to Hired and onboarding checklist initialized',
      {
        candidate: handoff.candidate,
        onboarding: handoff.onboarding,
      }
    );
  } catch (err) {
    next(err);
  }
};
