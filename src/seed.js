const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

const User = require('./models/User');

const seedUsers = async () => {
  try {
    const mongoURI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/peoplepulse';
    await mongoose.connect(mongoURI);
    console.log('[Seed] Connected to MongoDB...');

    // Clear existing users to avoid duplicates
    await User.deleteMany();
    console.log('[Seed] Cleared existing users.');

    // 1. Super Admin (matches the UI "Super Admin" view)
    const superAdmin = await User.create({
      name: 'Super Administrator',
      email: 'admin@peoplepulse.com',
      password: 'Password@123',
      role: 'superadmin',
      employeeId: 'EMP-1000',
      phoneNumber: '+92 300 0000000',
      department: 'Executive HR',
      designation: 'Chief HR Officer',
    });

    // 2. Regular Employee
    const employee = await User.create({
      name: 'Sarah Connor',
      email: 'sarah.connor@peoplepulse.com',
      password: 'Password@123',
      role: 'employee',
      employeeId: 'EMP-1001',
      phoneNumber: '+92 300 1234567',
      department: 'Engineering',
      designation: 'Senior Mobile Engineer',
      manager: superAdmin._id,
    });

    console.log('-------------------------------------------------------');
    console.log('✅ SEED COMPLETED SUCCESSFULLY!');
    console.log('-------------------------------------------------------');
    console.log('Test Accounts created:');
    console.log('👑 Super Admin:');
    console.log('   Email:    admin@peoplepulse.com');
    console.log('   Password: Password@123');
    console.log('   Role:     superadmin');
    console.log('');
    console.log('👤 Employee:');
    console.log('   Email:    sarah.connor@peoplepulse.com');
    console.log('   Password: Password@123');
    console.log('   Role:     employee');
    console.log('-------------------------------------------------------');

    // Inspect direct database representation to verify encryption & hashing
    const rawUsers = await mongoose.connection.db.collection('users').find({}).toArray();
    console.log('[Database Inspection - Raw MongoDB Documents]:');
    rawUsers.forEach((u) => {
      console.log(`- Email: ${u.email}`);
      console.log(`  Raw Stored Name (Encrypted AES-256): ${u.name}`);
      console.log(`  Raw Stored Password (Bcrypt Hash):   ${u.password}`);
    });
    console.log('-------------------------------------------------------');

    process.exit(0);
  } catch (error) {
    console.error(`[Seed Error]: ${error.message}`);
    process.exit(1);
  }
};

seedUsers();
