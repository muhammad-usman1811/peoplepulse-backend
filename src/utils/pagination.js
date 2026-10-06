const parsePositiveInteger = (value, fallback, maximum = Number.MAX_SAFE_INTEGER) => {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) return null;
  return parsed;
};

module.exports = { parsePositiveInteger };
