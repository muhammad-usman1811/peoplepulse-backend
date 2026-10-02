const mongoose = require('mongoose');
const Notification = require('../models/Notification');
const ApiResponse = require('../utils/apiResponse');

exports.listNotifications = async (req, res, next) => {
  try {
    const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 20, 1), 100);
    const filter = { userId: req.user._id };

    if (req.query.unread !== undefined) {
      if (!['true', 'false'].includes(req.query.unread)) {
        return ApiResponse.error(res, 'unread must be true or false', null, 400);
      }
      if (req.query.unread === 'true') filter.readAt = null;
    }

    const [notifications, total] = await Promise.all([
      Notification.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Notification.countDocuments(filter),
    ]);

    return ApiResponse.success(res, 'Notifications retrieved successfully', {
      notifications,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
};

exports.markNotificationRead = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return ApiResponse.error(res, 'Notification not found', null, 404);
    }
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { $set: { readAt: new Date() } },
      { new: true, runValidators: true }
    );
    if (!notification) return ApiResponse.error(res, 'Notification not found', null, 404);
    return ApiResponse.success(res, 'Notification marked as read', { notification });
  } catch (err) {
    next(err);
  }
};

exports.markAllNotificationsRead = async (req, res, next) => {
  try {
    const result = await Notification.updateMany(
      { userId: req.user._id, readAt: null },
      { $set: { readAt: new Date() } }
    );
    return ApiResponse.success(res, 'Notifications marked as read', {
      updatedCount: result.modifiedCount,
    });
  } catch (err) {
    next(err);
  }
};