require('dotenv').config();
const mongoose = require('mongoose');

const normalizeName = (value) => value.trim().toLowerCase();

const run = async () => {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI must be set before running this migration');

  await mongoose.connect(process.env.MONGO_URI);

  const departments = await mongoose.connection.collection('departments')
    .find({ location: { $type: 'string' } })
    .toArray();
  const locations = await mongoose.connection.collection('locations').find({}).toArray();
  const locationsByName = new Map();

  for (const location of locations) {
    const key = normalizeName(location.name || '');
    const matches = locationsByName.get(key) || [];
    matches.push(location);
    locationsByName.set(key, matches);
  }

  const operations = [];
  const unresolved = [];
  for (const department of departments) {
    const legacyName = department.location.trim();
    if (!legacyName) {
      operations.push({
        updateOne: {
          filter: { _id: department._id, location: department.location },
          update: { $set: { location: null } },
        },
      });
      continue;
    }

    const matches = locationsByName.get(normalizeName(legacyName)) || [];
    if (matches.length !== 1) {
      unresolved.push({ department: department.name, location: legacyName, matches: matches.length });
      continue;
    }

    operations.push({
      updateOne: {
        filter: { _id: department._id, location: department.location },
        update: { $set: { location: matches[0]._id } },
      },
    });
  }

  console.log(`[Department Location Backfill] Found ${departments.length} department string value(s).`);
  console.log(`[Department Location Backfill] ${operations.length} value(s) can be mapped.`);
  if (unresolved.length) {
    console.error('[Department Location Backfill] Unmatched or ambiguous values; no writes were made:');
    for (const item of unresolved) {
      console.error(`- ${item.department}: "${item.location}" (${item.matches} matching locations)`);
    }
    process.exitCode = 1;
    return;
  }

  if (!process.argv.includes('--apply')) {
    console.log('[Department Location Backfill] Dry run only. Re-run with --apply to write these mappings.');
    return;
  }

  if (operations.length) {
    const result = await mongoose.connection.collection('departments').bulkWrite(operations);
    console.log(`[Department Location Backfill] Updated ${result.modifiedCount} department(s).`);
  } else {
    console.log('[Department Location Backfill] No changes needed.');
  }
};

run()
  .catch((error) => {
    console.error(`[Department Location Backfill] Failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });