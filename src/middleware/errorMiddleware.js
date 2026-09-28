const ApiResponse = require('../utils/apiResponse');

/**
 * Global error handling middleware for Express
 */
const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // Log error in development
  if (process.env.NODE_ENV !== 'production') {
    console.error('[Error Details]:', err);
  }

  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    const message = `Resource not found with id ${err.value}`;
    return ApiResponse.error(res, message, null, 404);
  }

  // Mongoose duplicate key error (code 11000)
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    const message = `An account with that ${field} already exists.`;
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
  return ApiResponse.error(
    res,
    error.message || 'Internal Server Error',
    process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test' ? error.details || err.stack : null,
    error.statusCode || 500
  );
};

module.exports = errorHandler;
