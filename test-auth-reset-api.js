require('dotenv').config();
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const User = require('./src/models/User');
const { hashToken } = require('./src/utils/cryptoUtils');
const { getTestMongoUri } = require('./src/utils/testDatabase');

const baseUrl = `${process.env.BASE_URL || 'http://localhost:5000'}/api`;
const testPassword = process.env.TEST_USER_PASSWORD;
const nextPassword = `Reset-${Date.now()}-Password`;

const request = async (path, options = {}) => {
  const response = await fetch(`${baseUrl}${path}`, options);
  return { status: response.status, data: await response.json() };
};

(async () => {
  assert(testPassword, 'Set TEST_USER_PASSWORD for password-reset integration tests');
  await mongoose.connect(getTestMongoUri());
  let user;

  try {
    const health = await request('/health');
    assert.equal(health.status, 200);
    assert.equal(health.data.data.environment, 'test', 'API server must run in test mode');

    user = await User.create({
      name: 'Reset Test User',
      email: `password.reset.${Date.now()}@example.test`,
      password: testPassword,
      role: 'employee',
    });
    const loginResponse = await request('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user.email, password: testPassword }),
    });
    assert.equal(loginResponse.status, 200, 'Initial password should log in');
    const oldToken = loginResponse.data.data.token;

    const rawResetToken = user.getResetPasswordToken();
    await user.save({ validateBeforeSave: false });
    const stored = await User.findById(user._id).select('+resetPasswordToken');
    assert.equal(stored.resetPasswordToken, hashToken(rawResetToken));
    assert.notEqual(stored.resetPasswordToken, rawResetToken);

    const resetResponse = await request(`/auth/reset-password/${rawResetToken}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: nextPassword }),
    });
    assert.equal(resetResponse.status, 200, 'Valid reset token should be accepted');
    assert.equal(typeof resetResponse.data.data.token, 'string', 'Reset should return a new session token');

    const updated = await User.findById(user._id)
      .select('+password +resetPasswordToken')
      .lean();
    assert.equal(await require('bcryptjs').compare(nextPassword, updated.password), true);
    assert.equal(await require('bcryptjs').compare(testPassword, updated.password), false);
    assert.equal(updated.resetPasswordToken, undefined);
    assert.equal(updated.resetPasswordExpire, undefined);
    assert.equal(updated.tokenVersion, 1);

    const oldSession = await request('/auth/me', { headers: { Authorization: `Bearer ${oldToken}` } });
    assert.equal(oldSession.status, 401, 'Password reset must revoke the old JWT');
    const newSession = await request('/auth/me', {
      headers: { Authorization: `Bearer ${resetResponse.data.data.token}` },
    });
    assert.equal(newSession.status, 200, 'New reset session should remain valid');

    const reusedToken = await request(`/auth/reset-password/${rawResetToken}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: `Again-${Date.now()}-Password` }),
    });
    assert.equal(reusedToken.status, 400, 'Consumed reset token must not be reusable');

    console.log('Password reset HTTP integration test passed: hashed token, expiry, password hash, token cleanup, old/new sessions, and one-use token.');
  } finally {
    if (user) await User.deleteOne({ _id: user._id });
    await mongoose.disconnect();
  }
})().catch((error) => {
  console.error(`Password reset integration test failed: ${error.message}`);
  process.exit(1);
});