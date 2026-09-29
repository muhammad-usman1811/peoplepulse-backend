const mongoose = require('mongoose');

/**
 * AuditLog — immutable record of "who did what, when".
 *
 * Every write operation in the system should log an entry here so that
 * HR/admins have a full trail of changes for compliance and debugging.
 *
 * Fields:
 *  actor       – ObjectId of the User who performed the action
 *  actorName   – Snapshot of the user's display name at log time (denormalized
 *                so the record stays readable even if the user is deleted)
 *  actorRole   – Snapshot of the user's role at log time
 *  action      – Verb describing what happened (e.g. 'CREATE', 'UPDATE', 'DELETE', 'LOGIN')
 *  resource    – The entity type that was affected (e.g. 'SalaryStructure', 'User')
 *  resourceId  – ObjectId (or string) of the specific document that changed
 *  meta        – Optional free-form object with before/after values or other context
 *  ipAddress   – Originating IP address of the request
 *  userAgent   – Browser / client string (helpful for mobile vs web debugging)
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
    // We only set createdAt; updatedAt is omitted.
    timestamps: { createdAt: true, updatedAt: false },
  }
);

// Compound indexes for the most common query patterns:
//  • Filter by actor (who made changes)
//  • Filter by resource type + id (what was changed)
//  • Chronological listing with role filter
AuditLogSchema.index({ actor: 1, createdAt: -1 });
AuditLogSchema.index({ resource: 1, resourceId: 1, createdAt: -1 });
AuditLogSchema.index({ action: 1, createdAt: -1 });
AuditLogSchema.index({ createdAt: -1 });

/**
 * Static helper — call this from any controller instead of constructing
 * the log entry manually.
 *
 * @param {Object} params
 * @param {import('mongoose').Types.ObjectId} params.actor   User performing action
 * @param {string}  params.actorName   Display name snapshot
 * @param {string}  params.actorRole   Role snapshot
 * @param {string}  params.action      One of the enum values above
 * @param {string}  params.resource    Entity type (e.g. 'SalaryStructure')
 * @param {string}  [params.resourceId] ID of the affected document
 * @param {Object}  [params.meta]      Any extra context (before/after, diff)
 * @param {Object}  [params.req]       Express request object (for IP / UA extraction)
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
  const ipAddress = req
    ? (req.ip || req.headers['x-forwarded-for'] || '').split(',')[0].trim()
    : '';
  const userAgent = req ? (req.headers['user-agent'] || '') : '';

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
