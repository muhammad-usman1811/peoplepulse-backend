const isValidPhoneNumber = (value) => {
  if (typeof value !== 'string' || value.length > 30) return false;
  const normalized = value.trim().replace(/[\s().-]/g, '');
  return /^(?:\+?[1-9]\d{6,14}|0\d{6,14})$/.test(normalized);
};

module.exports = { isValidPhoneNumber };