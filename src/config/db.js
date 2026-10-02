const mongoose = require('mongoose');
const dns = require('dns');
const { isTestMongoUri } = require('../utils/testDatabase');

// Some networks refuse MongoDB Atlas SRV lookups through their default DNS.
// Use configurable public resolvers so mongodb+srv works without admin access.
dns.setServers((process.env.DNS_SERVERS || '8.8.8.8,1.1.1.1').split(','));

// Cache the in-flight/resolved connection promise across calls. On Vercel,
// src/server.js kicks this off once at cold-start module load, and
// api/index.js separately awaits the same cached promise before handling
// each request - without that second await, a cold start could receive a
// request before mongoose.connect() resolves, and every query issued
// before then buffers until Mongoose's default 10s bufferTimeoutMS and
// fails with "Operation `...` buffering timed out after 10000ms" (this
// was happening intermittently in production - confirmed via Vercel logs
// showing other DB-backed routes succeeding around the same cold start
// while the first /api/auth/login call on that instance failed).
let connectionPromise = null;

const connectDB = () => {
  if (connectionPromise) return connectionPromise;

  connectionPromise = (async () => {
    try {
      if (process.env.NODE_ENV === 'production' && !process.env.MONGO_URI) {
        throw new Error('MONGO_URI must be configured in production');
      }
      const mongoURI =
        process.env.NODE_ENV === 'test'
          ? process.env.MONGO_TEST_URI || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/peoplepulse_test'
          : process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/peoplepulse';
      if (process.env.NODE_ENV === 'test' && !isTestMongoUri(mongoURI)) {
        throw new Error('NODE_ENV=test requires MONGO_URI or MONGO_TEST_URI to use a database name ending in _test');
      }
      const conn = await mongoose.connect(mongoURI);

      console.log(`[Database] MongoDB Connected: ${conn.connection.host}/${conn.connection.name}`);
      return conn;
    } catch (error) {
      console.error(`[Database Error] Failed to connect to MongoDB: ${error.message}`);
      // Let the next call retry instead of caching a permanent failure
      connectionPromise = null;
      // Serverless functions must not exit the process; requests will report the error instead
      if (!process.env.VERCEL) {
        process.exit(1);
        return undefined; // unreachable, but keeps this branch from also rejecting below
      }
      throw error;
    }
  })();

  return connectionPromise;
};

module.exports = connectDB;
