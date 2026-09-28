const crypto = require('crypto');
const { getSearchIndexKey } = require('../config/security');

const normalizeSearchTerm = (value) => String(value || '').normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');

const searchDigest = (value) => crypto
  .createHmac('sha256', getSearchIndexKey())
  .update(normalizeSearchTerm(value))
  .digest('hex');

const buildNameSearchTokens = (value) => {
  const normalized = normalizeSearchTerm(value);
  const tokens = new Set();
  if (!normalized) return [];

  tokens.add(searchDigest(normalized));
  for (const word of normalized.split(' ')) {
    for (let start = 0; start < word.length; start += 1) {
      for (let end = start + 1; end <= word.length; end += 1) {
        tokens.add(searchDigest(word.slice(start, end)));
      }
    }
  }
  return [...tokens];
};

module.exports = {
  buildNameSearchTokens,
  normalizeSearchTerm,
  searchDigest,
};