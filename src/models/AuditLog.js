const mongoose = require('mongoose');

/**
 * AuditLog — immutable record of "who did what, when".
 *
 * Every write operation in the system should log an entry here so that
 * HR/admins have a full trail of changes for compliance and debugging.
 */
const AuditLogSchema = new mongoose.Schema(
  {
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Actor (user) is required'],
      index: true,
    },
    actorName: {
      type: String,
      trim: true,
      default: '',
    },
    actorRole: {
      type: String,
      trim: true,
      default: '',
    },
    action: {
      type: String,
      required: [true, 'Action is required'],
      enum: [
        'CREATE',
        'UPDATE',
        'DELETE',
        'APPROVE',
        'REJECT',
        'LOGIN',
        'LOGOUT',
        'PASSWORD_RESET',
        'ACTIVATE',
        'DEACTIVATE',
        'OTHER',
      ],
      uppercase: true,
      trim: true,
    },
    resource: {
      type: String,
      required: [true, 'Resource type is required'],
      trim: true,
    },
    resourceId: {
      type: String, // Store as string to support both ObjectId and composite keys
      default: null,
    },
    meta: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    ipAddress: {
      type: String,
      trim: true,
      default: '',
    },
    userAgent: {
      type: String,
      trim: true,
      default: '',
    },
  },
  {
    // AuditLog documents are intentionally immutable — no updates allowed.
    timestamps: { createdAt: true, updatedAt: false },
  }
);

AuditLogSchema.index({ actor: 1, createdAt: -1 });
AuditLogSchema.index({ resource: 1, resourceId: 1, createdAt: -1 });
AuditLogSchema.index({ action: 1, createdAt: -1 });
AuditLogSchema.index({ createdAt: -1 });

/**
 * Static helper — call this from any controller instead of constructing
 * the log entry manually.
 */
AuditLogSchema.statics.record = async function ({
  actor,
  actorName = '',
  actorRole = '',
  action,
  resource,
  resourceId = null,
  meta = null,
  req = null,
}) {
  if (process.env.NODE_ENV === 'test' && mongoose.connection.readyState !== 1) {
    return null;
  }

  const ipAddress = req
    ? (req.ip || (req.headers && req.headers['x-forwarded-for']) || '').split(',')[0].trim()
    : '';
  const userAgent = req && req.headers ? (req.headers['user-agent'] || '') : '';

  return this.create({
    actor,
    actorName,
    actorRole,
    action,
    resource,
    resourceId: resourceId ? String(resourceId) : null,
    meta,
    ipAddress,
    userAgent,
  });
};

module.exports = mongoose.model('AuditLog', AuditLogSchema);
