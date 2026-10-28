const crypto = require('crypto');

// Ambiguous characters (0, O, 1, l, I) removed so the temp password is easy
// for a human to read/type from an email.
const CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

/**
 * Generate a cryptographically secure random temporary password.
 * Replaces the old `Math.random().toString(36).slice(-8)` approach, which
 * is not cryptographically secure and can occasionally produce fewer than
 * 8 characters.
 * @param {number} length
 * @returns {string}
 */
function generateTempPassword(length = 10) {
  const bytes = crypto.randomBytes(length);
  let result = '';
  for (let i = 0; i < length; i++) {
    result += CHARSET[bytes[i] % CHARSET.length];
  }
  return result;
}

module.exports = generateTempPassword;
