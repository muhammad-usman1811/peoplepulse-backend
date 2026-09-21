/**
 * Standard API response helper to maintain consistent JSON format across
 * React Web and Flutter Mobile clients.
 */
class ApiResponse {
  static success(res, message = 'Success', data = null, statusCode = 200) {
    const response = {
      success: true,
      message,
    };
    if (data !== null && data !== undefined) {
      response.data = data;
    }
    return res.status(statusCode).json(response);
  }

  static error(res, message = 'An error occurred', error = null, statusCode = 500) {
    const response = {
      success: false,
      message,
    };
    if (error) {
      response.error = typeof error === 'object' && error.message ? error.message : error;
    }
    return res.status(statusCode).json(response);
  }
}

module.exports = ApiResponse;
