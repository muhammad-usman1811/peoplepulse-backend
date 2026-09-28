const mongoose = require('mongoose');
const PerformanceCycle = require('../models/PerformanceCycle');
const Review = require('../models/Review');
const ApiResponse = require('../utils/apiResponse');

exports.createCycle = async (req, res, next) => {
  try {
    const period = typeof req.body.period === 'string' ? req.body.period.trim() : '';
    if (!period) return ApiResponse.error(res, 'period is required', null, 400);

    const cycle = await PerformanceCycle.create({ period, status: req.body.status });
    return ApiResponse.success(res, 'Performance cycle created successfully', { cycle }, 201);
  } catch (err) {
    if (err.code === 11000) {
      return ApiResponse.error(res, 'A performance cycle already exists for this period', null, 409);
    }
    next(err);
  }
};

exports.submitSelfReview = async (req, res, next) => {
  try {
    if (req.user.role !== 'employee') {
      return ApiResponse.error(res, 'Only employees can submit a self-review', null, 403);
    }
    if (!mongoose.isValidObjectId(req.params.cycleId)) {
      return ApiResponse.error(res, 'Open performance cycle not found', null, 404);
    }

    const cycle = await PerformanceCycle.findOne({ _id: req.params.cycleId, status: 'open' });
    if (!cycle) return ApiResponse.error(res, 'Open performance cycle not found', null, 404);

    const selfReview = typeof req.body.selfReview === 'string' ? req.body.selfReview.trim() : '';
    const { rating } = req.body;
    if (!selfReview) return ApiResponse.error(res, 'selfReview is required', null, 400);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return ApiResponse.error(res, 'rating must be a whole number from 1 to 5', null, 400);
    }

    const review = await Review.create({
      cycle: cycle._id,
      employee: req.user._id,
      selfReview,
      rating,
    });
    return ApiResponse.success(res, 'Self-review submitted successfully', { review }, 201);
  } catch (err) {
    if (err.code === 11000) {
      return ApiResponse.error(res, 'You have already submitted a review for this cycle', null, 409);
    }
    next(err);
  }
};