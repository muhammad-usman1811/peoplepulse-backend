const Notification = require('../models/Notification');

const notify = (userId, type, title, body) => Notification.create({
  userId,
  type,
  title,
  body,
});

module.exports = notify;