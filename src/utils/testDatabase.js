const isTestMongoUri = (uri) => {
  if (typeof uri !== 'string' || !uri.trim()) return false;
  const databaseName = uri.split(/[?#]/, 1)[0].replace(/\/$/, '').split('/').pop();
  try {
    return decodeURIComponent(databaseName).toLowerCase().endsWith('_test');
  } catch {
    return false;
  }
};

const getTestMongoUri = () => {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('Integration tests must run with NODE_ENV=test');
  }
  if (!isTestMongoUri(process.env.MONGO_TEST_URI)) {
    throw new Error('Set MONGO_TEST_URI to a dedicated database whose name ends in _test');
  }
  return process.env.MONGO_TEST_URI;
};

module.exports = { getTestMongoUri, isTestMongoUri };