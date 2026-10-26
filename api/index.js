// Vercel serverless entry point.
//
// src/server.js already calls connectDB() once at module load (cold start),
// but that call is fire-and-forget: Express starts accepting requests
// immediately, before mongoose.connect() has resolved. On a cold start,
// a request can arrive and issue a query before the connection is ready;
// Mongoose buffers that query and, if the connection hasn't finished by
// its default 10s bufferTimeoutMS, fails with "Operation `...` buffering
// timed out after 10000ms" - this was happening intermittently in
// production. connectDB() returns a cached promise, so awaiting it here
// is a no-op on every request after the first on a given warm instance.

// Normalize before anything else is required. src/server.js also calls this, but it is
// loaded second, and src/config/db.js reads DNS_SERVERS in its module body - so on this
// entrypoint that read would otherwise see the raw, possibly BOM-prefixed value.
require('dotenv').config();
require('../src/config/env').normalizeEnv();

const connectDB = require('../src/config/db');
const app = require('../src/server');

module.exports = async (req, res) => {
  try {
    await connectDB();
  } catch (error) {
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      success: false,
      message: 'Database connection is not available. Please try again shortly.',
    }));
    return;
  }
  return app(req, res);
};
