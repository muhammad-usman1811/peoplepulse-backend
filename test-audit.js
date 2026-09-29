require('dotenv').config();
const assert = require('assert');

const baseUrl = `${process.env.BASE_URL || 'http://localhost:5000'}/api`;

const request = async (path, options = {}) => {
  const response = await fetch(`${baseUrl}${path}`, options);
  const data = await response.json();
  return { status: response.status, data };
};

async function testAuditFlow() {
  assert(process.env.TEST_ADMIN_EMAIL && process.env.TEST_ADMIN_PASSWORD, 'Set test-admin credentials before running integration tests');
  console.log('🧪 Starting Audit Log End-to-End Test...\n');

  // 1. Confirm this test targets an isolated test-mode API
  const healthRes = await request('/health');
  assert.strictEqual(healthRes.status, 200, 'API test server should be reachable');
  assert.strictEqual(healthRes.data.data.environment, 'test', 'API server must run in test mode');

  // 2. Log in as the test Super Admin
  console.log('Step 1: Logging in as Super Admin...');
  const loginRes = await request('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: process.env.TEST_ADMIN_EMAIL,
      password: process.env.TEST_ADMIN_PASSWORD,
    }),
  });

  assert.strictEqual(loginRes.status, 200, 'Super Admin login should return 200');
  const token = loginRes.data.data.token;
  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
  console.log('✅ Logged in successfully!\n');

  const unauthenticatedList = await request('/payroll/salary-structure');
  assert.strictEqual(unauthenticatedList.status, 401, 'Salary structure reads should require authentication');

  const invalidCreate = await request('/payroll/salary-structure', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ grade: `INVALID-${Date.now()}` }),
  });
  assert.strictEqual(invalidCreate.status, 400, 'Invalid salary structures should be rejected');

  // 2. Perform an audited action (Create Salary Structure)
  const testGrade = `TEST-GRADE-${Date.now()}`;
  console.log(`Step 2: Creating Salary Structure (${testGrade}) to trigger audit log...`);
  const createRes = await request('/payroll/salary-structure', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      grade: testGrade,
      basicPercentage: 50,
      allowances: [{ name: 'Housing', type: 'percentage', value: 20 }],
    }),
  });

  assert.strictEqual(createRes.status, 201, 'Should create salary structure with 201');
  const createdDoc = createRes.data.data.salaryStructure;
  console.log(`✅ Salary structure created with ID: ${createdDoc._id}\n`);

  const listRes = await request('/payroll/salary-structure', { headers: authHeaders });
  assert.strictEqual(listRes.status, 200, 'Salary structure listing should return 200');
  assert(listRes.data.data.salaryStructures.some((item) => item._id === createdDoc._id), 'Created structure should appear in the list');

  const duplicateCreate = await request('/payroll/salary-structure', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ grade: testGrade, basicPercentage: 50 }),
  });
  assert.strictEqual(duplicateCreate.status, 409, 'Duplicate salary grades should be rejected');

  // 3. Query Audit Logs (GET /audit-log?resource=SalaryStructure&action=CREATE)
  console.log('Step 3: Querying audit log for CREATE action on SalaryStructure...');
  const auditListRes = await request(`/audit-log?resource=SalaryStructure&action=CREATE&resourceId=${createdDoc._id}`, {
    headers: authHeaders,
  });

  assert.strictEqual(auditListRes.status, 200, 'Audit log query should return 200');
  const logs = auditListRes.data.data.logs;
  assert(logs.length > 0, 'Audit log entry should exist for the created structure');
  const createLog = logs[0];
  console.log('✅ Audit log found:');
  console.log(`   - Action: ${createLog.action}`);
  console.log(`   - Resource: ${createLog.resource} (ID: ${createLog.resourceId})`);
  console.log(`   - Actor Name: ${createLog.actorName} (${createLog.actorRole})`);
  console.log(`   - Created At: ${createLog.createdAt}\n`);

  // 4. Query single Audit Log by ID (GET /audit-log/:id)
  console.log(`Step 4: Fetching single audit log by ID (${createLog._id})...`);
  const singleLogRes = await request(`/audit-log/${createLog._id}`, {
    headers: authHeaders,
  });
  assert.strictEqual(singleLogRes.status, 200, 'Fetching single audit log should return 200');
  assert.strictEqual(singleLogRes.data.data.log._id, createLog._id);
  console.log('✅ Successfully retrieved single audit log entry!\n');

  // 5. Update Salary Structure to trigger UPDATE audit log
  console.log('Step 5: Updating Salary Structure to test UPDATE audit...');
  const updateRes = await request(`/payroll/salary-structure/${createdDoc._id}`, {
    method: 'PUT',
    headers: authHeaders,
    body: JSON.stringify({
      basicPercentage: 60,
    }),
  });
  assert.strictEqual(updateRes.status, 200, 'Salary structure update should return 200');
  console.log('✅ Salary structure updated.\n');

  // 6. Delete Salary Structure to trigger DELETE audit log and cleanup
  console.log('Step 6: Deleting Salary Structure to test DELETE audit...');
  const deleteRes = await request(`/payroll/salary-structure/${createdDoc._id}`, {
    method: 'DELETE',
    headers: authHeaders,
  });
  assert.strictEqual(deleteRes.status, 200, 'Salary structure delete should return 200');
  console.log('✅ Salary structure deleted.\n');

  // 7. Verify all audit logs for this resourceId
  console.log('Step 7: Verifying complete audit trail for this resourceId...');
  const fullTrailRes = await request(`/audit-log?resourceId=${createdDoc._id}`, {
    headers: authHeaders,
  });
  assert.strictEqual(fullTrailRes.status, 200);
  const trailLogs = fullTrailRes.data.data.logs;
  const actions = trailLogs.map((l) => l.action);
  console.log(`   Trail actions recorded: ${actions.join(', ')}`);
  assert(actions.includes('CREATE'), 'Trail must contain CREATE');
  assert(actions.includes('UPDATE'), 'Trail must contain UPDATE');
  assert(actions.includes('DELETE'), 'Trail must contain DELETE');
  console.log('✅ Complete lifecycle audit trail verified successfully!\n');

  console.log('🎉 AUDIT LOG TESTS COMPLETED SUCCESSFULLY!');
}

testAuditFlow().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
