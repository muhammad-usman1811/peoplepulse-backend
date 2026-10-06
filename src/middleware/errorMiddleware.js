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

  if (err.type === 'entity.too.large' || err.status === 413) {
    const isDocumentUpload = req.path.endsWith('/documents/upload')
      || req.path.endsWith('/api/documents/upload');
    const isFilePayload = isDocumentUpload || req.is('application/octet-stream');
    const requestLimit = Number.isFinite(err.limit)
      ? err.limit % (1024 * 1024) === 0
        ? `${err.limit / (1024 * 1024)}MB`
        : `${Math.ceil(err.limit / 1024)}KB`
      : 'the configured limit';
    const message = isFilePayload
      ? 'Uploaded file exceeds the 4MB limit'
      : req.is('application/json') || req.is('application/x-www-form-urlencoded')
        ? `Request body exceeds ${requestLimit}`
        : 'Request body is too large';
    return ApiResponse.error(res, message, null, 413);
  }

  // Default internal server error
  return ApiResponse.error(res, isProduction ? 'Internal Server Error' : error.message || 'Internal Server Error', isProduction ? null : err.stack, error.statusCode || err.status || 500);
};

module.exports = errorHandler;
