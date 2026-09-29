const getJwtSecret = () => {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is not configured');
  return process.env.JWT_SECRET;
};

const getEncryptionKey = () => {
  if (!process.env.ENCRYPTION_KEY) throw new Error('ENCRYPTION_KEY is not configured');
  if (!/^[0-9a-fA-F]{64}$/.test(process.env.ENCRYPTION_KEY)) {
    throw new Error('ENCRYPTION_KEY must be exactly 64 hexadecimal characters');
  }
  return process.env.ENCRYPTION_KEY;
};

const getSearchIndexKey = () => process.env.SEARCH_INDEX_KEY || getEncryptionKey();

const validateSecurityConfig = () => {
  getJwtSecret();
  getEncryptionKey();
  getSearchIndexKey();
};

module.exports = {
  getEncryptionKey,
  getJwtSecret,
  getSearchIndexKey,
  validateSecurityConfig,
};