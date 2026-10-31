const mongoose = require('mongoose');
const dotenv = require('dotenv');
const { isTestMongoUri } = require('./utils/testDatabase');

dotenv.config();
require('./config/env').normalizeEnv();

if (process.env.NODE_ENV === 'production') {
  throw new Error('Seeding is disabled in production');
}

if (!process.env.SEED_PASSWORD) {
  throw new Error('SEED_PASSWORD must be set before running the seed script');
}

const User = require('./models/User');
const Department = require('./models/Department');
const Designation = require('./models/Designation');
const Location = require('./models/Location');
const LeaveRequest = require('./models/LeaveRequest');
const WfhRequest = require('./models/WfhRequest');

const seedUsers = async () => {
  try {
    if (process.env.NODE_ENV === 'production' || process.env.ALLOW_DESTRUCTIVE_SEED !== 'true') {
      throw new Error('Seed refused. Set ALLOW_DESTRUCTIVE_SEED=true in a non-production environment to replace users.');
    }
    const mongoURI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/peoplepulse';
    if (process.env.NODE_ENV === 'test' && !isTestMongoUri(mongoURI)) {
      throw new Error('NODE_ENV=test requires MONGO_URI to use a database name ending in _test');
    }
    await mongoose.connect(mongoURI);
    console.log('[Seed] Connected to MongoDB...');

    // Clear existing users to avoid duplicates
    await User.deleteMany();
    await LeaveRequest.deleteMany();
    await WfhRequest.deleteMany();
    console.log('[Seed] Cleared existing users.');

    await Promise.all([
      ...['General', 'Executive HR', 'Engineering', 'Human Resources'].map((name) => Department.updateOne({ name }, { $setOnInsert: { name } }, { upsert: true })),
      ...['Chief HR Officer', 'Senior Mobile Engineer', 'HR Manager', 'Team Member'].map((name) => Designation.updateOne({ name }, { $setOnInsert: { name } }, { upsert: true })),
      ...['Head Office'].map((name) => Location.updateOne({ name }, { $setOnInsert: { name } }, { upsert: true })),
    ]);
    console.log('[Seed] Master lists are ready.');

    // 1. Super Admin (matches the UI "Super Admin" view)
    const superAdmin = await User.create({
      name: 'Super Administrator',
      email: 'admin@peoplepulse.com',
      password: process.env.SEED_PASSWORD,
      role: 'superadmin',
      employeeId: 'EMP-1000',
      phoneNumber: '+92 300 0000000',
      department: 'Executive HR',
      designation: 'Chief HR Officer',
    });

    // 2. Regular Employee
    await User.create({
      name: 'Sarah Connor',
      email: 'sarah.connor@peoplepulse.com',
      password: process.env.SEED_PASSWORD,
      role: 'employee',
      employeeId: 'EMP-1001',
      phoneNumber: '+92 300 1234567',
      department: 'Engineering',
      designation: 'Senior Mobile Engineer',
      manager: superAdmin._id,
    });

    await User.create({
      name: 'HR Manager',
      email: 'hr@peoplepulse.com',
      password: process.env.SEED_PASSWORD,
      role: 'hr',
      employeeId: 'EMP-1002',
      department: 'Human Resources',
      designation: 'HR Manager',
      location: 'Head Office',
      manager: superAdmin._id,
    });

    console.log('-------------------------------------------------------');
    console.log('✅ SEED COMPLETED SUCCESSFULLY!');
    console.log('-------------------------------------------------------');
    console.log('Test Accounts created:');
    console.log('👑 Super Admin:');
    console.log('   Email:    admin@peoplepulse.com');
    console.log('   Role:     superadmin');
    console.log('');
    console.log('👤 Employee:');
    console.log('   Email:    sarah.connor@peoplepulse.com');
    console.log('   Role:     employee');
    console.log('');
    console.log('🧑‍💼 HR Manager:');
    console.log('   Email:    hr@peoplepulse.com');
    console.log('   Role:     hr');
    console.log('-------------------------------------------------------');

    process.exit(0);
  } catch (error) {
    console.error(`[Seed Error]: ${error.message}`);
    process.exit(1);
  }
};

seedUsers();
