require('dotenv').config();
const dns = require('node:dns');
dns.setServers((process.env.DNS_SERVERS || '8.8.8.8,1.1.1.1').split(','));

const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const User = require('./src/models/User');
const Review = require('./src/models/Review');
const PerformanceCycle = require('./src/models/PerformanceCycle');
const { getTestMongoUri } = require('./src/utils/testDatabase');
const app = require('./src/server');

(async () => {
  console.log('--- STARTING RUNTIME POSTMAN COLLECTION RUNNER ---');
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(getTestMongoUri(), { serverSelectionTimeoutMS: 20000 });
  } else if (mongoose.connection.readyState === 2) {
    await new Promise((resolve) => mongoose.connection.once('connected', resolve));
  }

  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/api`;

  const password = process.env.TEST_USER_PASSWORD || 'Secret@123';
  const suffix = `${Date.now()}`;

  // Create test users
  const managerUser = await User.create({
    name: 'Postman Manager',
    email: `pm.manager.${suffix}@example.test`,
    password,
    role: 'employee',
  });

  const employeeUser = await User.create({
    name: 'Postman Employee',
    email: `pm.employee.${suffix}@example.test`,
    password,
    role: 'employee',
    manager: managerUser._id,
  });

  const outsiderUser = await User.create({
    name: 'Postman Outsider',
    email: `pm.outsider.${suffix}@example.test`,
    password,
    role: 'employee',
  });

  const adminUser = await User.create({
    name: 'Postman Admin',
    email: `pm.admin.${suffix}@example.test`,
    password,
    role: 'hr',
  });

  const variables = {
    baseUrl,
    testAdminEmail: adminUser.email,
    testAdminPassword: password,
    testEmployeeEmail: employeeUser.email,
    testManagerEmail: managerUser.email,
    testOutsiderEmail: outsiderUser.email,
    testUserPassword: password,
    adminToken: '',
    managerToken: '',
    employeeToken: '',
    outsiderToken: '',
    performanceCycleId: '',
    performanceReviewId: '',
  };

  const collectionPath = path.resolve('PeoplePulse_Performance_API.postman_collection.json');
  const collection = JSON.parse(fs.readFileSync(collectionPath, 'utf8'));

  let passedRequests = 0;
  let failedRequests = 0;

  for (let i = 0; i < collection.item.length; i++) {
    const item = collection.item[i];
    let url = item.request.url.replace(/\{\{(\w+)\}\}/g, (_, k) => variables[k] || '');
    if (url.startsWith('http://localhost:5000/api')) {
      url = url.replace('http://localhost:5000/api', baseUrl);
    }
    const method = item.request.method;
    const headers = {};
    for (const h of item.request.header || []) {
      headers[h.key] = h.value.replace(/\{\{(\w+)\}\}/g, (_, k) => variables[k] || '');
    }

    let body;
    if (item.request.body && item.request.body.raw) {
      body = item.request.body.raw.replace(/\{\{(\w+)\}\}/g, (_, k) => variables[k] || '');
    }

    try {
      const res = await fetch(url, { method, headers, body });
      const resJson = await res.json().catch(() => ({}));

      // Mock PM environment for tests
      const pm = {
        response: {
          code: res.status,
          status: res.status,
          to: {
            have: {
              status: (code) => assert.equal(res.status, code, `Expected HTTP ${code} but got ${res.status} on "${item.name}"`),
            },
          },
          json: () => resJson,
        },
        collectionVariables: {
          set: (k, v) => { variables[k] = v; },
          get: (k) => variables[k],
        },
        expect: (val) => ({
          to: {
            be: {
              get empty() {
                assert.equal(!val || val.length === 0 || Object.keys(val).length === 0, true, `Expected ${JSON.stringify(val)} to be empty`);
                return true;
              },
              get true() {
                assert.equal(Boolean(val), true, `Expected ${val} to be true`);
                return true;
              },
              get false() {
                assert.equal(Boolean(val), false, `Expected ${val} to be false`);
                return true;
              },
              within: (min, max) => {
                assert.ok(val >= min && val <= max, `Expected ${val} to be within ${min} and ${max}`);
              },
            },
            not: {
              be: {
                get empty() {
                  assert.equal(Boolean(val && (val.length > 0 || (typeof val === 'object' && Object.keys(val).length > 0))), true, `Expected ${JSON.stringify(val)} to not be empty`);
                  return true;
                },
              },
            },
            eql: (expected) => assert.deepEqual(val, expected),
            equal: (expected) => assert.equal(val, expected),
            have: {
              status: (code) => assert.equal(res.status, code, `Expected status ${code} but got ${res.status}`),
            },
          },
        }),
        test: (name, fn) => {
          try {
            fn();
          } catch (e) {
            throw new Error(`Test '${name}' failed: ${e.message}`);
          }
        },
      };

      // Run tests defined in Postman request
      if (item.event) {
        for (const ev of item.event) {
          if (ev.listen === 'test' && ev.script && ev.script.exec) {
            const scriptCode = ev.script.exec.join('\n');
            const runScript = new Function('pm', scriptCode);
            runScript(pm);
          }
        }
      }

      console.log(`✔ [${i + 1}/${collection.item.length}] ${item.name} (${res.status} OK)`);
      passedRequests++;
    } catch (err) {
      console.error(`✖ [${i + 1}/${collection.item.length}] ${item.name} FAILED:`, err.message);
      failedRequests++;
    }
  }

  // Cleanup
  await Review.deleteMany({ employee: { $in: [employeeUser._id, managerUser._id, outsiderUser._id, adminUser._id] } });
  if (variables.performanceCycleId) {
    await PerformanceCycle.deleteOne({ _id: variables.performanceCycleId });
  }
  await User.deleteMany({ _id: { $in: [employeeUser._id, managerUser._id, outsiderUser._id, adminUser._id] } });
  server.close();
  await mongoose.disconnect();

  console.log(`\n========================================`);
  console.log(`POSTMAN RUN COMPLETE: ${passedRequests} PASSED, ${failedRequests} FAILED`);
  console.log(`========================================`);

  if (failedRequests > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
})().catch((err) => {
  console.error('Postman runner fatal error:', err);
  process.exit(1);
});
