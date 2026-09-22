const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const mongoURI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/peoplepulse';
    const conn = await mongoose.connect(mongoURI);

    console.log(`[Database] MongoDB Connected: ${conn.connection.host}/${conn.connection.name}`);
  } catch (error) {
    console.error(`[Database Error] Failed to connect to MongoDB: ${error.message}`);
<<<<<<< HEAD
    process.exit(1);
=======
    // Serverless functions must not exit the process; requests will report the error instead
    if (!process.env.VERCEL) process.exit(1);
>>>>>>> 60cba7b (login api)
  }
};

module.exports = connectDB;
