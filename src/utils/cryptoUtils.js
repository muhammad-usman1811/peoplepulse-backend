const crypto = require('crypto');

// Algorithm: AES-256-GCM (Authenticated Encryption)
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 16 bytes for AES

const isHex = (value) => typeof value === 'string' && /^[0-9a-fA-F]*$/.test(value);

const isEncryptedValue = (value) => {
  if (typeof value !== 'string') return false;
  const parts = value.split(':');
  return parts.length === 3 &&
    parts[0].length === IV_LENGTH * 2 &&
    parts[1].length === 32 &&
    parts[2].length > 0 &&
    parts[2].length % 2 === 0 &&
    parts.every(isHex);
};

// Helper to get 32-byte encryption key buffer
function getSecretKey() {
  const envKey = process.env.ENCRYPTION_KEY;
  if (!envKey || !/^[0-9a-fA-F]{64}$/.test(envKey)) {
    throw new Error('ENCRYPTION_KEY must be exactly 64 hexadecimal characters');
  }
  return Buffer.from(envKey, 'hex');
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Output format: ivHex:authTagHex:encryptedHex
 * @param {string} text Plain text to encrypt
 * @returns {string} Encrypted ciphertext bundle
 */
function encrypt(text) {
  if (text === undefined || text === null) return text;
  const key = getSecretKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(String(text), 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypt a ciphertext bundle (ivHex:authTagHex:encryptedHex) using AES-256-GCM.
 * @param {string} encryptedBundle Ciphertext bundle
 * @returns {string} Original plaintext
 */
function decrypt(encryptedBundle) {
  if (!encryptedBundle || typeof encryptedBundle !== 'string') return encryptedBundle;
  const parts = encryptedBundle.split(':');
  if (parts.length !== 3) {
    // If not matching encrypted format, return as is (prevents crashing on legacy/unencrypted data)
    return encryptedBundle;
  }

  try {
    const [ivHex, authTagHex, encryptedHex] = parts;
    if (!isEncryptedValue(encryptedBundle)) return encryptedBundle;
    const key = getSecretKey();
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);

    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    // If decryption fails, return null or fallback
    return '[Decryption Error]';
  }
}

/**
 * Hash a plain token using SHA-256 (for password reset tokens in database)
 * @param {string} token Plain token
 * @returns {string} Hexadecimal SHA-256 hash
 */
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

module.exports = {
  encrypt,
  decrypt,
  hashToken,
  isEncryptedValue,
};
