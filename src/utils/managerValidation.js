const mongoose = require('mongoose');
const User = require('../models/User');
const AppError = require('./appError');

const validateManager = async (manager, currentId) => {
  if (manager === null || manager === '') return null;
  if (!mongoose.isValidObjectId(manager)) {
    throw new AppError('Manager must be a valid user ID', 400);
  }
  if (currentId && String(manager) === String(currentId)) {
    throw new AppError('A user cannot be their own manager', 400);
  }
  if (!(await User.exists({ _id: manager, isActive: true }))) {
    throw new AppError('Selected manager does not exist or is inactive', 400);
  }

  const visited = new Set();
  let cursor = manager;
  while (cursor) {
    const cursorId = String(cursor);
    if (visited.has(cursorId) || (currentId && cursorId === String(currentId))) {
      throw new AppError('This manager assignment would create a circular reporting chain', 400);
    }
    visited.add(cursorId);
    const managerUser = await User.findById(cursor).select('manager').lean();
    cursor = managerUser && managerUser.manager;
  }

  return manager;
};

module.exports = validateManager;