const ApiResponse = require('../utils/apiResponse');

/**
 * Global error handling middleware for Express
 */
const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;
  const isProduction = process.env.NODE_ENV === 'production';

  console.error('[Error Details]:', err);

  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    const message = isProduction ? 'Resource not found' : `Resource not found with id ${err.value}`;
    return ApiResponse.error(res, message, null, 404);
  }

  // Mongoose duplicate key error (code 11000)
  if (err.code === 11000) {
    const field = err.keyValue ? Object.keys(err.keyValue)[0] : null;
    const message = isProduction
      ? 'A resource with those details already exists.'
      : `An account with that ${field || 'value'} already exists.`;
    return ApiResponse.error(res, message, null, 409);
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors)
      .map((val) => val.message)
      .join(', ');
    return ApiResponse.error(res, message, null, 400);
  }

  // Default internal server error
  return ApiResponse.error(res, isProduction ? 'Internal Server Error' : error.message || 'Internal Server Error', isProduction ? null : err.stack, error.statusCode || 500);
};

module.exports = errorHandler;
