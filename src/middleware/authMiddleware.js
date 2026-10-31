const jwt = require('jsonwebtoken');
const User = require('../models/User');
const ApiResponse = require('../utils/apiResponse');
const { getJwtSecret } = require('../config/security');

// jsonwebtoken's errors for malformed, forged, or not-yet-valid tokens; CastError is a
// verified token whose id is not an ObjectId.
const INVALID_TOKEN_ERRORS = ['JsonWebTokenError', 'NotBeforeError', 'CastError'];

/**
 * Middleware to protect private routes with JWT Bearer tokens
 */
const protect = async (req, res, next) => {
  let token;

  // Read Authorization header: Bearer <token>
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return ApiResponse.error(
      res,
      'Access denied. No authentication token provided.',
      null,
      401
    );
  }

  try {
    // Verify token
    const decoded = jwt.verify(
      token,
      getJwtSecret()
    );

    // Attach user to request object (exclude password)
    const user = await User.findById(decoded.id);

    if (!user) {
      return ApiResponse.error(
        res,
        'User belonging to this token no longer exists.',
        null,
        401
      );
    }

    if (!user.isActive) {
      return ApiResponse.error(
        res,
        'This account has been deactivated. Please contact your Super Admin.',
        null,
        403
      );
    }

    if ((decoded.tokenVersion || 0) !== (user.tokenVersion || 0)) {
      return ApiResponse.error(
        res,
        'Authentication token has been revoked. Please log in again.',
        null,
        401
      );
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return ApiResponse.error(
        res,
        'Authentication token has expired. Please log in again.',
        null,
        401
      );
    }
    // Only a bad token means "log in again". Anything else, such as the database being
    // unreachable during the user lookup, is a server error: answering 401 would make
    // clients sign users out during an outage.
    if (INVALID_TOKEN_ERRORS.includes(err.name)) {
      return ApiResponse.error(
        res,
        'Invalid authentication token.',
        null,
        401
      );
    }
    return next(err);
  }
};

/**
 * Middleware for Role-Based Access Control (RBAC)
 * @param  {...string} roles Allowed roles (e.g. 'superadmin', 'admin')
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return ApiResponse.error(
        res,
        `User role '${req.user.role}' is not authorized to access this resource`,
        null,
        403
      );
    }
    next();
  };
};

module.exports = {
  protect,
  authorize,
};
