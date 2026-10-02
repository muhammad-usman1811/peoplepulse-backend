const mongoose = require('mongoose');
const dns = require('dns');
const { isTestMongoUri } = require('../utils/testDatabase');

// Some networks refuse MongoDB Atlas SRV lookups through their default DNS.
// Use configurable public resolvers so mongodb+srv works without admin access.
dns.setServers((process.env.DNS_SERVERS || '8.8.8.8,1.1.1.1').split(','));

const connectDB = async () => {
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
  } catch (error) {
    console.error(`[Database Error] Failed to connect to MongoDB: ${error.message}`);
    // Serverless functions must not exit the process; requests will report the error instead
    if (!process.env.VERCEL) process.exit(1);
  }
};

module.exports = connectDB;
