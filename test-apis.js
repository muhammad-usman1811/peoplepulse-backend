const BASE_URL = 'http://localhost:5000';

async function testAllApis() {
  console.log('====================================================');
  console.log('         TESTING PEOPLEPULSE HRMS BACKEND APIS      ');
  console.log('====================================================\n');

  const randomId = Math.floor(Math.random() * 10000);
  const testEmail = `testuser_${randomId}@example.com`;
  const initialPassword = 'password123';
  const newPassword = 'myNewSecretPassword456';

  // 1. Health Check
  try {
    console.log('1. Testing Health Check Endpoint: GET /api/health');
    const res = await fetch(`${BASE_URL}/api/health`);
    const data = await res.json();
    console.log(`   [STATUS]: ${res.status}`);
    console.log(`   [RESPONSE]:`, data);
  } catch (err) {
    console.error('   [ERROR]: Server is not reachable. Make sure "npm run dev" is running.');
    return;
  }

  // 2. Register API
  try {
    console.log('\n2. Testing Register API: POST /api/auth/register');
    const res = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Muneeb Employee',
        email: testEmail,
        password: initialPassword,
        role: 'employee',
      }),
    });
    const data = await res.json();
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
    console.log('\n5. Testing Change Password API: POST /api/auth/change-password');
    const res = await fetch(`${BASE_URL}/api/auth/change-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
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
