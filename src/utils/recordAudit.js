const AuditLog = require('../models/AuditLog');

const recordAudit = ({ req, actor = req && req.user, action, resource, resourceId, meta = null }) => {
  if (!actor || !actor._id) return;

  AuditLog.record({
    actor: actor._id,
    actorName: actor.name || '',
    actorRole: actor.role || '',
    action,
    resource,
    resourceId,
    meta,
    req,
  }).catch((error) => {
    console.error(`[AuditLog] Failed to record ${action} ${resource}:`, error.message);
  });
};

module.exports = recordAudit;