const assert = require('assert');

async function runTests() {
  const baseUrl = 'http://localhost:5000/api';
  console.log('🧪 Running PeoplePulse API Automated Tests...\n');

  // 1. Health check
  console.log('Test 1: Health check endpoint GET /api/health');
  const healthRes = await fetch(`${baseUrl}/health`);
  const healthData = await healthRes.json();
  assert.strictEqual(healthRes.status, 200, 'Health check should return 200');
  assert.strictEqual(healthData.success, true, 'Health check should have success: true');
  console.log('✅ Health check passed!\n');

  // 2. Failed login attempt
  console.log('Test 2: Failed login attempt (wrong password) POST /api/auth/login');
  const badLoginRes = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@peoplepulse.com',
      password: 'WrongPassword!',
    }),
  });
  const badLoginData = await badLoginRes.json();
  assert.strictEqual(badLoginRes.status, 401, 'Wrong password should return 401');
  assert.strictEqual(badLoginData.success, false, 'Should report success: false');
  console.log('✅ Bad credentials rejected with 401!\n');

  // 3. Successful Super Admin login
  console.log('Test 3: Super Admin login POST /api/auth/login');
  const loginRes = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@peoplepulse.com',
      password: 'Password@123',
    }),
  });
  const loginData = await loginRes.json();
  assert.strictEqual(loginRes.status, 200, 'Login should return 200');
  assert.strictEqual(loginData.success, true, 'Login should succeed');
  assert(loginData.data.token, 'Should receive JWT token');
  assert.strictEqual(loginData.data.user.email, 'admin@peoplepulse.com');
  assert.strictEqual(loginData.data.user.role, 'superadmin');
  assert.strictEqual(loginData.data.user.name, 'Super Administrator'); // Decrypted for API consumer
  const jwtToken = loginData.data.token;
  console.log(`✅ Super Admin logged in successfully! Received JWT: ${jwtToken.substring(0, 25)}...\n`);

  // 4. Protected Route GET /api/auth/me without token
  console.log('Test 4: Access protected route GET /api/auth/me without token');
  const unauthRes = await fetch(`${baseUrl}/auth/me`);
  const unauthData = await unauthRes.json();
  assert.strictEqual(unauthRes.status, 401, 'Unauthorized request should return 401');
  assert.strictEqual(unauthData.success, false);
  console.log('✅ Protected route blocked unauthorized request with 401!\n');

  // 5. Protected Route GET /api/auth/me with Bearer token
  console.log('Test 5: Access protected route GET /api/auth/me with Bearer token');
  const meRes = await fetch(`${baseUrl}/auth/me`, {
    headers: { Authorization: `Bearer ${jwtToken}` },
  });
  const meData = await meRes.json();
  assert.strictEqual(meRes.status, 200, 'Authenticated request should return 200');
  assert.strictEqual(meData.data.user.name, 'Super Administrator');
  assert.strictEqual(meData.data.user.role, 'superadmin');
  console.log('✅ Bearer token accepted and user profile returned!\n');

  // 6. User Registration POST /api/auth/register
  console.log('Test 6: Register new user POST /api/auth/register');
  const testEmail = `developer_${Date.now()}@peoplepulse.com`;
  const regRes = await fetch(`${baseUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Alex Johnson',
      email: testEmail,
      password: 'MySecretPassword123!',
      role: 'employee',
      department: 'Product Design',
      designation: 'UI/UX Designer',
    }),
  });
  const regData = await regRes.json();
  assert.strictEqual(regRes.status, 201, 'Registration should return 201');
  assert.strictEqual(regData.data.user.email, testEmail);
  console.log(`✅ New user registered successfully (${testEmail})!\n`);

  // 7. Forgot password POST /api/auth/forgot-password
  console.log('Test 7: Forgot password flow POST /api/auth/forgot-password');
  const forgotRes = await fetch(`${baseUrl}/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testEmail }),
  });
  const forgotData = await forgotRes.json();
  assert.strictEqual(forgotRes.status, 200, 'Forgot password should return 200');
  const resetToken = forgotData.data.resetToken;
  assert(resetToken, 'Should receive reset token');
  console.log(`✅ Password reset token generated: ${resetToken.substring(0, 15)}...\n`);

  // 8. Reset password PUT /api/auth/reset-password/:resetToken
  console.log('Test 8: Reset password with token PUT /api/auth/reset-password/:token');
  const resetRes = await fetch(`${baseUrl}/auth/reset-password/${resetToken}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'BrandNewPassword456!' }),
  });
  const resetData = await resetRes.json();
  assert.strictEqual(resetRes.status, 200, 'Password reset should return 200');
  console.log('✅ Password successfully reset!\n');

  // 9. Login with new password
  console.log('Test 9: Verify login with new password POST /api/auth/login');
  const newLoginRes = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: testEmail,
      password: 'BrandNewPassword456!',
    }),
  });
  const newLoginData = await newLoginRes.json();
  assert.strictEqual(newLoginRes.status, 200, 'Login with new password should return 200');
  assert.strictEqual(newLoginData.success, true);
  console.log('✅ Login with updated password verified!\n');

  console.log('=======================================================');
  console.log('🎉 ALL 9 TEST SUITES PASSED FLAWLESSLY!');
  console.log('=======================================================');
}

runTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
