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
