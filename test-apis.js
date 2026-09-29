require('dotenv').config();

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';

async function testAllApis() {
  console.log('====================================================');
  console.log('         TESTING PEOPLEPULSE HRMS BACKEND APIS      ');
  console.log('====================================================\n');

  const randomId = Math.floor(Math.random() * 10000);
  const testEmail = `testuser_${randomId}@example.com`;
  const initialPassword = process.env.TEST_USER_PASSWORD;
  const newPassword = 'myNewSecretPassword456';
  let employeeToken;
  if (!initialPassword) throw new Error('Set TEST_USER_PASSWORD for this test run.');

  // 1. Health Check
  try {
    console.log('1. Testing Health Check Endpoint: GET /api/health');
    const res = await fetch(`${BASE_URL}/api/health`);
    const data = await res.json();
    if (data.data?.environment !== 'test') {
      throw new Error('Refusing API tests unless the server runs with NODE_ENV=test and a dedicated *_test database.');
    }
    console.log(`   [STATUS]: ${res.status}`);
    console.log(`   [RESPONSE]:`, data);
  } catch (err) {
    console.error('   [ERROR]: Server is not reachable. Make sure "npm run dev" is running.');
    return;
  }

  // 2. Register API
  try {
    console.log('\n2. Testing anonymous registration is blocked: POST /api/auth/register');
    const publicRes = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Muneeb Employee',
        email: testEmail,
        password: initialPassword,
        role: 'employee',
      }),
    });
    const publicData = await publicRes.json();
    if (publicRes.status !== 401) throw new Error(`Expected anonymous registration to return 401; got ${publicRes.status}`);
    console.log(`   [STATUS]: ${publicRes.status}`);
    console.log(`   [RESPONSE]:`, publicData);

    const adminEmail = process.env.TEST_ADMIN_EMAIL;
    const adminPassword = process.env.TEST_ADMIN_PASSWORD;
    if (!adminEmail || !adminPassword) {
      console.log('   [SKIP]: Set TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD to test authorized registration and later steps.');
      return;
    }

    const adminLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: adminEmail, password: adminPassword }),
    });
    const adminLoginData = await adminLoginRes.json();
    if (adminLoginRes.status !== 200) throw new Error('Admin login failed; authorized registration was not tested.');
    const adminToken = adminLoginData.data.token;

    console.log('\n3. Testing authorized registration: POST /api/auth/register');
    const res = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ name: 'Muneeb Employee', email: testEmail, password: initialPassword }),
    });
    const data = await res.json();
    if (res.status !== 201) throw new Error(`Authorized registration failed with ${res.status}`);
    if (data.data.token) throw new Error('Registration unexpectedly returned an employee token');
    console.log(`   [STATUS]: ${res.status}`);
    console.log(`   [RESPONSE]:`, data);
  } catch (err) {
    console.error('   [ERROR]:', err.message);
  }

  // 3. Login API (Success)
  try {
    console.log('\n3. Testing Login API: POST /api/auth/login');
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: initialPassword,
      }),
    });
    const data = await res.json();
    console.log(`   [STATUS]: ${res.status}`);
    console.log(`   [RESPONSE]:`, data);
    if (res.status === 200) employeeToken = data.data.token;
  } catch (err) {
    console.error('   [ERROR]:', err.message);
  }

  // 4. Login API (Wrong Password)
  try {
    console.log('\n4. Testing Login with Invalid Password: POST /api/auth/login');
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: 'wrong_password_999',
      }),
    });
    const data = await res.json();
    console.log(`   [STATUS]: ${res.status}`);
    console.log(`   [RESPONSE]:`, data);
  } catch (err) {
    console.error('   [ERROR]:', err.message);
  }

  // 5. Change Password API
  try {
    console.log('\n5. Testing Change Password API: PUT /api/profile/password');
    const res = await fetch(`${BASE_URL}/api/profile/password`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${employeeToken}` },
      body: JSON.stringify({
        currentPassword: initialPassword,
        newPassword: newPassword,
      }),
    });
    const data = await res.json();
    console.log(`   [STATUS]: ${res.status}`);
    console.log(`   [RESPONSE]:`, data);
  } catch (err) {
    console.error('   [ERROR]:', err.message);
  }

  // 6. Login with New Password
  try {
    console.log('\n6. Testing Login with New Password: POST /api/auth/login');
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: newPassword,
      }),
    });
    const data = await res.json();
    console.log(`   [STATUS]: ${res.status}`);
    console.log(`   [RESPONSE]:`, data);
  } catch (err) {
    console.error('   [ERROR]:', err.message);
  }

  // 7. Forgot Password API
  try {
    console.log('\n7. Testing Forgot Password API: POST /api/auth/forgot-password');
    const res = await fetch(`${BASE_URL}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
      }),
    });
    const data = await res.json();
    console.log(`   [STATUS]: ${res.status}`);
    console.log(`   [RESPONSE]:`, data);
  } catch (err) {
    console.error('   [ERROR]:', err.message);
  }

  console.log('\n====================================================');
  console.log('             ALL API TESTS COMPLETED!               ');
  console.log('====================================================');
}

testAllApis();
