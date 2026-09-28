require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const { buildNameSearchTokens } = require('../utils/searchIndex');

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const users = await User.find().select('+nameSearchTokens');
  if (users.length) {
    await User.bulkWrite(users.map((user) => ({
      updateOne: {
        filter: { _id: user._id },
        update: { $set: { nameSearchTokens: buildNameSearchTokens(user.name) } },
      },
    })));
  }
  console.log(`[Search Index] Backfilled ${users.length} user names.`);
  await mongoose.disconnect();
};

run().catch(async (error) => {
  console.error(`[Search Index] Backfill failed: ${error.message}`);
  await mongoose.disconnect();
  process.exitCode = 1;
});