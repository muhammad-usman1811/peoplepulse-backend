const mongoose = require('mongoose');
const validator = require('validator');
const Candidate = require('../models/Candidate');
const JobPosting = require('../models/JobPosting');
const recruitmentStages = require('../utils/recruitmentStages');
const ApiResponse = require('../utils/apiResponse');

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

    const candidate = await Candidate.findByIdAndUpdate(
      req.params.candidateId,
      { $set: { stage } },
      { new: true, runValidators: true }
    );
    if (!candidate) return ApiResponse.error(res, 'Candidate not found', null, 404);

    return ApiResponse.success(res, 'Candidate stage updated successfully', { candidate });
  } catch (err) {
    next(err);
  }
};