const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

// Loading the app validates secrets and starts connectDB(); use the test-only keys
// from src/config/security.js and keep this suite database-free.
process.env.NODE_ENV = 'test';
mongoose.connect = async () => ({ connection: { host: 'stub', name: 'stub' } });
const app = require('./src/server');
const swaggerDocument = require('./src/config/swagger');

// Legacy alias of /api/audit-logs, noted in that operation's description.
const UNDOCUMENTED_ALIASES = new Set(['GET /api/audit-log', 'GET /api/audit-log/{}']);
const METHODS = ['get', 'post', 'put', 'patch', 'delete'];
const normalize = (path) => path.replace(/:[A-Za-z]+/g, '{}').replace(/\{[^}]+\}/g, '{}');

const implementedRoutes = () => {
  const routes = new Set();
  for (const layer of app._router.stack) {
    if (layer.name !== 'router' || !layer.handle.stack) continue;
    // Mount regexps look like /^\/api\/auth\/?(?=\/|$)/i
    const base = layer.regexp.source.split('\\/?(?=')[0].replace(/[\\^]/g, '');
    for (const sub of layer.handle.stack) {
      if (!sub.route) continue;
      for (const method of Object.keys(sub.route.methods)) {
        routes.add(`${method.toUpperCase()} ${normalize(base + (sub.route.path === '/' ? '' : sub.route.path))}`);
      }
    }
  }
  return routes;
};

const documentedRoutes = () => {
  const routes = new Set();
  for (const [path, operations] of Object.entries(swaggerDocument.paths)) {
    for (const method of Object.keys(operations).filter((m) => METHODS.includes(m))) {
      routes.add(`${method.toUpperCase()} ${normalize(`/api${path}`)}`);
    }
  }
  return routes;
};

test('every implemented /api route is documented in Swagger', () => {
  const documented = documentedRoutes();
  const missing = [...implementedRoutes()]
    .filter((route) => route.includes(' /api/') && !documented.has(route) && !UNDOCUMENTED_ALIASES.has(route));
  assert.deepEqual(missing, []);
});

test('every documented Swagger operation is implemented', () => {
  const implemented = implementedRoutes();
  const stale = [...documentedRoutes()].filter((route) => route !== 'GET /api/health' && !implemented.has(route));
  assert.deepEqual(stale, []);
});

test('every secured operation documents 401', () => {
  const missing = [];
  for (const [path, operations] of Object.entries(swaggerDocument.paths)) {
    for (const [method, operation] of Object.entries(operations)) {
      if (operation.security?.length && !operation.responses?.[401]) missing.push(`${method.toUpperCase()} ${path}`);
    }
  }
  assert.deepEqual(missing, []);
});
