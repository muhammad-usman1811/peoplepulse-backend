require('dotenv').config();
const dns = require('node:dns');
dns.setServers((process.env.DNS_SERVERS || '8.8.8.8,1.1.1.1').split(','));

const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const User = require('./src/models/User');
const JobPosting = require('./src/models/JobPosting');
const Candidate = require('./src/models/Candidate');
const { getTestMongoUri } = require('./src/utils/testDatabase');
const app = require('./src/server');

(async () => {
  console.log('--- STARTING RUNTIME RECRUITMENT POSTMAN COLLECTION RUNNER ---');
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

  // Create HR Admin user
  const hrUser = await User.create({
    name: 'Recruitment Admin',
    email: `recruit.admin.${suffix}@example.test`,
    password,
    role: 'hr',
  });

  const variables = {
    baseUrl,
    hrEmail: hrUser.email,
    hrPassword: password,
    hrToken: '',
    jobPostingId: '',
    candidateId: '',
    candidateEmail: '',
  };

  const collectionPath = path.resolve('PeoplePulse_Recruitment_API.postman_collection.json');
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
      let raw = item.request.body.raw
        .replace(/\{\{\$guid\}\}/g, () => `${Date.now()}-${Math.random().toString(16).slice(2)}`)
        .replace(/\{\{(\w+)\}\}/g, (_, k) => variables[k] || '');
      body = raw;
    }

    try {
      const res = await fetch(url, { method, headers, body });
      const resJson = await res.json().catch(() => ({}));

      // Mock PM environment
      const pm = {
        response: {
          code: res.status,
          status: res.status,
          to: {
            have: {
              status: (code) => assert.equal(res.status, code, `Expected status ${code} but got ${res.status} on "${item.name}"`),
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
  if (variables.jobPostingId) {
    await Candidate.deleteMany({ jobPosting: variables.jobPostingId });
    await JobPosting.deleteOne({ _id: variables.jobPostingId });
  }
  await User.deleteOne({ _id: hrUser._id });
  server.close();
  await mongoose.disconnect();

  console.log(`\n========================================`);
  console.log(`RECRUITMENT POSTMAN RUN COMPLETE: ${passedRequests} PASSED, ${failedRequests} FAILED`);
  console.log(`========================================`);

  if (failedRequests > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
})().catch((err) => {
  console.error('Recruitment Postman runner fatal error:', err);
  process.exit(1);
});
