const mongoose = require('mongoose');
const validator = require('validator');
const Candidate = require('../models/Candidate');
const JobPosting = require('../models/JobPosting');
const Onboarding = require('../models/Onboarding');
const recruitmentStages = require('../utils/recruitmentStages');
const ApiResponse = require('../utils/apiResponse');
const { triggerOnboardingForCandidate } = require('../utils/triggerOnboarding');
const { parsePositiveInteger } = require('../utils/pagination');

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

exports.getJobPostings = async (req, res, next) => {
  try {
    const page = parsePositiveInteger(req.query.page, 1);
    const limit = parsePositiveInteger(req.query.limit, 10, 100);
    if (page === null || limit === null) {
      return ApiResponse.error(res, 'page must be a positive integer and limit must be between 1 and 100', null, 400);
    }

    const [total, jobPostings] = await Promise.all([
      JobPosting.countDocuments({}),
      JobPosting.find({})
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
    ]);
    return ApiResponse.success(res, 'Job postings retrieved successfully', {
      jobPostings,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
};

exports.getJobPosting = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.jobPostingId)) {
      return ApiResponse.error(res, 'Job posting not found', null, 404);
    }
    const jobPosting = await JobPosting.findById(req.params.jobPostingId);
    if (!jobPosting) return ApiResponse.error(res, 'Job posting not found', null, 404);
    return ApiResponse.success(res, 'Job posting retrieved successfully', { jobPosting });
  } catch (err) {
    next(err);
  }
};

exports.getCandidates = async (req, res, next) => {
  try {
    const page = parsePositiveInteger(req.query.page, 1);
    const limit = parsePositiveInteger(req.query.limit, 10, 100);
    if (page === null || limit === null) {
      return ApiResponse.error(res, 'page must be a positive integer and limit must be between 1 and 100', null, 400);
    }

    const filter = {};
    if (req.query.stage) {
      if (!recruitmentStages.includes(req.query.stage)) {
        return ApiResponse.error(res, `stage must be one of: ${recruitmentStages.join(', ')}`, null, 400);
      }
      filter.stage = req.query.stage;
    }
    if (req.query.jobPosting) {
      if (!mongoose.isValidObjectId(req.query.jobPosting)) {
        return ApiResponse.error(res, 'jobPosting must be a valid job posting ID', null, 400);
      }
      filter.jobPosting = req.query.jobPosting;
    }
    if (req.query.search) {
      const search = String(req.query.search).trim();
      if (search.length > 120) {
        return ApiResponse.error(res, 'search must be 120 characters or fewer', null, 400);
      }
      filter.$or = [
        { name: new RegExp(escapeRegex(search), 'i') },
        { email: new RegExp(escapeRegex(search), 'i') },
      ];
    }

    const [total, candidates] = await Promise.all([
      Candidate.countDocuments(filter),
      Candidate.find(filter)
        .sort({ updatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('jobPosting', 'title department')
        .populate('onboarding', 'title status employee'),
    ]);
    return ApiResponse.success(res, 'Candidates retrieved successfully', {
      candidates,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
};

exports.getCandidate = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.candidateId)) {
      return ApiResponse.error(res, 'Candidate not found', null, 404);
    }
    const candidate = await Candidate.findById(req.params.candidateId)
      .populate('jobPosting', 'title department')
      .populate('onboarding', 'title status employee');
    if (!candidate) return ApiResponse.error(res, 'Candidate not found', null, 404);
    return ApiResponse.success(res, 'Candidate retrieved successfully', { candidate });
  } catch (err) {
    next(err);
  }
};

exports.createJobPosting = async (req, res, next) => {
  try {
    const title = typeof req.body.title === 'string' ? req.body.title.trim() : '';
    const department = typeof req.body.department === 'string' ? req.body.department.trim() : '';
    if (!title || !department) {
      return ApiResponse.error(res, 'title and department are required', null, 400);
    }
    if (title.length > 150 || department.length > 120) {
      return ApiResponse.error(res, 'title or department exceeds the maximum length', null, 400);
    }

    const jobPosting = await JobPosting.create({ title, department });
    return ApiResponse.success(res, 'Job posting created successfully', { jobPosting }, 201);
  } catch (err) {
    next(err);
  }
};

exports.createCandidate = async (req, res, next) => {
  try {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const jobPostingId = req.body.jobPosting;
    if (!name || name.length > 120) {
      return ApiResponse.error(res, 'name is required and cannot exceed 120 characters', null, 400);
    }
    if (!validator.isEmail(email) || email.length > 254) {
      return ApiResponse.error(res, 'email must be a valid email address', null, 400);
    }
    if (!mongoose.isValidObjectId(jobPostingId)) {
      return ApiResponse.error(res, 'jobPosting must be a valid job posting ID', null, 400);
    }
    if (!(await JobPosting.exists({ _id: jobPostingId }))) {
      return ApiResponse.error(res, 'Job posting not found', null, 404);
    }

    const candidate = await Candidate.create({ name, email, jobPosting: jobPostingId });
    return ApiResponse.success(res, 'Candidate added successfully', { candidate }, 201);
  } catch (err) {
    if (err.code === 11000) {
      return ApiResponse.error(res, 'Candidate already applied to this posting', null, 409);
    }
    next(err);
  }
};

exports.moveCandidateStage = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.candidateId)) {
      return ApiResponse.error(res, 'Candidate not found', null, 404);
    }

    const { stage } = req.body;
    if (!recruitmentStages.includes(stage)) {
      return ApiResponse.error(res, `stage must be one of: ${recruitmentStages.join(', ')}`, null, 400);
    }

    let candidate = await Candidate.findById(req.params.candidateId);
    if (!candidate) return ApiResponse.error(res, 'Candidate not found', null, 404);

    let onboarding = null;
    if (stage === 'Hired') {
      if (candidate.stage !== 'Offer' && candidate.stage !== 'Hired') {
        return ApiResponse.error(res, 'Candidates must reach Offer before they can be hired', null, 409);
      }
      // Create checklist first; if succeeds, sets stage to Hired
      const handoff = await triggerOnboardingForCandidate(candidate, req.user, req);
      candidate = handoff.candidate;
      onboarding = handoff.onboarding;
    } else if (stage === candidate.stage) {
      // Repeating the current stage is an idempotent no-op.
    } else {
      const currentIndex = recruitmentStages.indexOf(candidate.stage);
      const nextIndex = recruitmentStages.indexOf(stage);
      if (nextIndex !== currentIndex + 1) {
        return ApiResponse.error(res, 'Candidates must move forward one recruitment stage at a time', null, 409);
      }
      candidate.stage = stage;
      await candidate.save();
    }

    const data = { candidate };
    if (onboarding) data.onboarding = onboarding;

    return ApiResponse.success(res, 'Candidate stage updated successfully', data);
  } catch (err) {
    next(err);
  }
};

exports.hireCandidate = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.candidateId)) {
      return ApiResponse.error(res, 'Candidate not found', null, 404);
    }

    const candidate = await Candidate.findById(req.params.candidateId);
    if (!candidate) return ApiResponse.error(res, 'Candidate not found', null, 404);
    if (candidate.stage !== 'Offer' && candidate.stage !== 'Hired') {
      return ApiResponse.error(res, 'Candidates must reach Offer before they can be hired', null, 409);
    }

    const handoff = await triggerOnboardingForCandidate(candidate, req.user, req);

    return ApiResponse.success(res, 'Candidate hired successfully and onboarding checklist initialized', {
      candidate: handoff.candidate,
      onboarding: handoff.onboarding,
    });
  } catch (err) {
    next(err);
  }
};

exports.getCandidateOnboarding = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.candidateId)) {
      return ApiResponse.error(res, 'Candidate not found', null, 404);
    }

    const candidate = await Candidate.findById(req.params.candidateId);
    if (!candidate) return ApiResponse.error(res, 'Candidate not found', null, 404);

    const onboarding = candidate.onboarding
      ? await Onboarding.findById(candidate.onboarding)
        .populate('employee', 'name email employeeId department designation')
        .populate('candidate', 'name email stage')
      : await Onboarding.findOne({ candidate: candidate._id })
        .populate('employee', 'name email employeeId department designation')
        .populate('candidate', 'name email stage');

    if (!onboarding) {
      return ApiResponse.error(res, 'Onboarding checklist not found for candidate', null, 404);
    }

    return ApiResponse.success(res, 'Candidate onboarding checklist retrieved successfully', { onboarding });
  } catch (err) {
    next(err);
  }
};