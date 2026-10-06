const Onboarding = require('../models/Onboarding');
const Candidate = require('../models/Candidate');
const User = require('../models/User');
const Document = require('../models/Document');
const recordAudit = require('./recordAudit');
const notify = require('./notify');
const selectHireIdentityEmail = (query) =>
  query && typeof query.select === 'function' ? query.select('+hireIdentityEmail') : query;

const DEFAULT_ONBOARDING_TASKS = [
  {
    title: 'Upload Identification & Personal Documents',
    description: 'Upload CNIC/Passport, photographs, and educational certificates',
    category: 'Documentation',
    documentRequirement: 'identityDocuments',
    status: 'Pending',
  },
  {
    title: 'IT Systems & Equipment Setup',
    description: 'Provide corporate email address, laptop, and access permissions',
    category: 'IT Setup',
    status: 'Pending',
  },
  {
    title: 'HR Orientation & Policy Sign-off',
    description: 'Attend HR onboarding session and sign employee handbook policies',
    category: 'HR Orientation',
    status: 'Pending',
  },
  {
    title: 'Sign Employment Contract & Tax Forms',
    description: 'Review, sign, and submit formal employment contract and tax forms',
    category: 'Documentation',
    documentRequirement: 'employmentDocuments',
    status: 'Pending',
  },
  {
    title: 'Complete Employee Profile Setup',
    description: 'Fill emergency contact, bank account, and personal bio details in PeoplePulse',
    category: 'General',
    status: 'Pending',
  },
];

/**
 * Triggers onboarding checklist for a candidate upon hire.
 *
 * FIX H1: candidate.stage and candidate.save() are now ALWAYS executed at the
 * end of this function, outside the `if (!onboarding)` block.  Previously the
 * stage update was skipped when an onboarding checklist already existed (e.g.
 * HR pre-created it via POST /onboarding before moving the stage to Hired),
 * leaving the candidate stuck in the old stage (e.g. "Offer") forever.
 *
 * Handles race conditions by returning existing checklist on duplicate E11000.
 *
 * @param {Object|string} candidateOrId - Candidate document or ObjectId
 * @param {Object} [actor]              - User who triggered the onboarding
 * @param {Object} [req]                - Express request (for audit IP/UA)
 */
const triggerOnboardingForCandidate = async (candidateOrId, actor = null, req = null) => {
  const candidateId = typeof candidateOrId === 'object' ? candidateOrId._id : candidateOrId;
  const candidate = typeof candidateOrId === 'object' && candidateOrId.name && candidateOrId.email
    ? candidateOrId
    : await Candidate.findById(candidateId);

  if (!candidate) throw new Error('Candidate not found');

  const normalizedEmail = candidate.email.toLowerCase();

  // ── BUG-1 FIX (updated for BUG-B) ──────────────────────────────────────────
  // Find any existing ACTIVE checklist for this candidate / email.
  // "Active" = not Completed AND not Cancelled.
  // BUG-B: Previously $ne:'Completed' was used, which matched Cancelled too —
  // hire would reuse a dead Cancelled checklist, giving the employee no tasks.
  // ─────────────────────────────────────────────────────────────────────────────
  const INACTIVE_STATUSES = ['Completed', 'Cancelled'];
  let onboarding = await selectHireIdentityEmail(Onboarding.findOne({ hireIdentityEmail: normalizedEmail, status: { $nin: INACTIVE_STATUSES } }));
  if (!onboarding) {
    onboarding = await selectHireIdentityEmail(Onboarding.findOne({ candidate: candidate._id, status: { $nin: INACTIVE_STATUSES } }));
  }

  const employeeUser = await User.findOne({ email: normalizedEmail });

  // ── BUG-2 FIX ───────────────────────────────────────────────────────────────
  // If the employee already has an active (non-Completed / non-Cancelled)
  // checklist that was pre-created by HR, use it instead of creating a
  // duplicate.  createOnboarding has this guard; trigger did not — fixed here.
  // ─────────────────────────────────────────────────────────────────────────────
  if (!onboarding && employeeUser) {
    onboarding = await Onboarding.findOne({
      employee: employeeUser._id,
      status: { $nin: ['Completed', 'Cancelled'] },
    });
  }

  let createdOnboarding = false;

  if (!onboarding) {
    try {
      onboarding = await Onboarding.create({
        title: `Onboarding Checklist - ${candidate.name}`,
        candidate: candidate._id,
        hireIdentityEmail: normalizedEmail,
        employee: employeeUser ? employeeUser._id : undefined,
        status: 'Pending',
        tasks: DEFAULT_ONBOARDING_TASKS,
        startedAt: new Date(),
      });
      createdOnboarding = Boolean(onboarding);
    } catch (err) {
      if (err.code === 11000) {
        // Race condition: another request created it first — fetch the winner
        onboarding = await selectHireIdentityEmail(Onboarding.findOne({ candidate: candidate._id, status: { $nin: INACTIVE_STATUSES } }))
            || await selectHireIdentityEmail(Onboarding.findOne({ hireIdentityEmail: normalizedEmail, status: { $nin: INACTIVE_STATUSES } }));
      } else {
        throw err;
      }
    }
  }

  if (onboarding) {
    let onboardingDirty = false;
    if (!onboarding.hireIdentityEmail) {
      onboarding.hireIdentityEmail = normalizedEmail;
      onboardingDirty = true;
    }
    if (employeeUser && !onboarding.employee) {
      onboarding.employee = employeeUser._id;
      onboardingDirty = true;
    }
    if (onboardingDirty) {
      await onboarding.save();
    }
    if (employeeUser) {
      await Document.updateMany(
        { candidate: candidate._id },
        { $set: { employee: employeeUser._id, onboarding: onboarding._id } }
      );
    }
  }

  if (createdOnboarding) {
    if (actor) {
      recordAudit({
        req,
        actor,
        action: 'CREATE',
        resource: 'Onboarding',
        resourceId: onboarding._id,
        meta: {
          candidateId: candidate._id,
          candidateName: candidate.name,
          employeeId: employeeUser ? employeeUser._id : null,
          tasksCount: DEFAULT_ONBOARDING_TASKS.length,
        },
      });
    }

    if (employeeUser) {
      notify(
        employeeUser._id,
        'SYSTEM',
        'Welcome to PeoplePulse!',
        'Your onboarding checklist has been created. Please review your pending onboarding tasks.'
      ).catch((err) => console.error('[Notification Error]:', err.message));
    }
  }

  // ── H1 FIX ─────────────────────────────────────────────────────────────────
  // Always sync candidate.stage and candidate.onboarding regardless of whether
  // the checklist was just created or already existed.  This ensures re-hiring
  // attempts and pre-created checklists both land the candidate in Hired stage.
  // ───────────────────────────────────────────────────────────────────────────
  let candidateDirty = false;

  if (candidate.stage !== 'Hired') {
    candidate.stage = 'Hired';
    candidateDirty = true;
  }

  if (onboarding && String(candidate.onboarding) !== String(onboarding._id)) {
    candidate.onboarding = onboarding._id;
    candidateDirty = true;
  }

  if (candidateDirty) {
    await candidate.save();
  }

  return { candidate, onboarding };
};

module.exports = {
  triggerOnboardingForCandidate,
  DEFAULT_ONBOARDING_TASKS,
};
