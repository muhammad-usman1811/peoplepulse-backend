const mongoose = require('mongoose');
const dns = require('dns');

// Some networks refuse MongoDB Atlas SRV lookups through their default DNS.
// Use configurable public resolvers so mongodb+srv works without admin access.
dns.setServers((process.env.DNS_SERVERS || '8.8.8.8,1.1.1.1').split(','));

const connectDB = async () => {
  try {
    const mongoURI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/peoplepulse';
    const conn = await mongoose.connect(mongoURI);

    console.log(`[Database] MongoDB Connected: ${conn.connection.host}/${conn.connection.name}`);
  } catch (error) {
    console.error(`[Database Error] Failed to connect to MongoDB: ${error.message}`);
    // Serverless functions must not exit the process; requests will report the error instead
    if (!process.env.VERCEL) process.exit(1);
  }
};

module.exports = connectDB;
