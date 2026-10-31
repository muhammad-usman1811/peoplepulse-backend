require('dotenv').config();
const connectDB = require('./src/config/db');
const User = require('./src/models/User');
const bcrypt = require('bcryptjs');
const { getTestMongoUri } = require('./src/utils/testDatabase');

const createTestUser = async () => {
  try {
    process.env.MONGO_URI = getTestMongoUri();
    const testPassword = process.env.TEST_USER_PASSWORD;
    if (!testPassword) throw new Error('TEST_USER_PASSWORD must be set for test user creation');
    await connectDB();

    const targetEmail = process.argv[2] || 'testuser@gmail.com';
    const cleanEmail = targetEmail.trim().toLowerCase();

    let user = await User.findOne({ email: cleanEmail });
    if (user) {
      console.log(`User already exists in MongoDB: ${cleanEmail}`);
    } else {
      const hashedPassword = await bcrypt.hash(testPassword, 12);
      user = await User.create({
        name: 'Test User',
        email: cleanEmail,
        password: hashedPassword,
        role: 'employee',
      });
      console.log(`Successfully created test user in MongoDB: ${cleanEmail}`);
    }

    console.log('User details:', { id: user._id, email: user.email, role: user.role });
    process.exit(0);
  } catch (error) {
    console.error('Error creating test user:', error.message);
    process.exit(1);
  }
};

createTestUser();
