require('dotenv').config();
const assert = require('assert');

async function runTests() {
  const baseUrl = `${process.env.BASE_URL || 'http://localhost:5000'}/api`;
  if (!process.env.TEST_ADMIN_EMAIL || !process.env.TEST_ADMIN_PASSWORD) {
    throw new Error('Set TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD for the disposable test database.');
  }
  console.log('🧪 Running PeoplePulse API Automated Tests...\n');

  // 1. Health check
  console.log('Test 1: Health check endpoint GET /api/health');
  const healthRes = await fetch(`${baseUrl}/health`);
  const healthData = await healthRes.json();
  assert.strictEqual(healthRes.status, 200, 'Health check should return 200');
  assert.strictEqual(healthData.success, true, 'Health check should have success: true');
  assert.strictEqual(healthData.data.environment, 'test', 'API server must run in test mode');
  console.log('✅ Health check passed!\n');

  // 2. Failed login attempt
  console.log('Test 2: Failed login attempt (wrong password) POST /api/auth/login');
  const badLoginRes = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
    email: process.env.TEST_ADMIN_EMAIL,
    password: `wrong-${Date.now()}-password`,
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
      email: process.env.TEST_ADMIN_EMAIL,
      password: process.env.TEST_ADMIN_PASSWORD,
    }),
  });
  const loginData = await loginRes.json();
  assert.strictEqual(loginRes.status, 200, 'Login should return 200');
  assert.strictEqual(loginData.success, true, 'Login should succeed');
  assert(loginData.data.token, 'Should receive JWT token');
  assert.strictEqual(loginData.data.user.email, process.env.TEST_ADMIN_EMAIL);
  assert.strictEqual(loginData.data.user.role, 'superadmin');
  assert.strictEqual(loginData.data.user.name, 'Super Administrator'); // Decrypted for API consumer
  const jwtToken = loginData.data.token;
  console.log('✅ Super Admin logged in successfully; JWT received.\n');

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
  const publicRegRes = await fetch(`${baseUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Anonymous Registration Check',
      email: `anonymous_${Date.now()}@peoplepulse.com`,
      password: 'MySecretPassword123!',
    }),
  });
  assert.strictEqual(publicRegRes.status, 401, 'Registration without a token should return 401');
  const regRes = await fetch(`${baseUrl}/auth/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${jwtToken}`,
    },
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
  assert.strictEqual(regData.data.token, undefined, 'Admin registration must not return the new employee token');
  console.log(`✅ New user registered successfully (${testEmail})!\n`);

  await new Promise((resolve) => setTimeout(resolve, 250));
  const registrationAuditRes = await fetch(
    `${baseUrl}/audit-log?resource=User&resourceId=${regData.data.user.id}&action=CREATE`,
    { headers: { Authorization: `Bearer ${jwtToken}` } }
  );
  const registrationAuditData = await registrationAuditRes.json();
  assert.strictEqual(registrationAuditRes.status, 200, 'Admin should be able to query registration audit logs');
  assert(registrationAuditData.data.logs.length > 0, 'Employee registration should create an audit entry');

  // 7. Forgot password POST /api/auth/forgot-password
  console.log('Test 7: Forgot password flow POST /api/auth/forgot-password');
  const forgotRes = await fetch(`${baseUrl}/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testEmail }),
  });
  const forgotData = await forgotRes.json();
  if (forgotRes.status === 503 && !process.env.EMAIL_USER) {
    console.log('⚠️ Forgot password email delivery skipped because SMTP credentials are not configured.');
    return;
  }
  assert.strictEqual(forgotRes.status, 200, 'Forgot password should return 200');
  assert.strictEqual(forgotData.data?.resetToken, undefined, 'Reset token must never be returned by the API');
  console.log('✅ Forgot password response does not expose the reset token. Configure SMTP for end-to-end email delivery testing.\n');

  console.log('=======================================================');
  console.log('🎉 API TEST SUITES PASSED!');
  console.log('=======================================================');
}

runTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
