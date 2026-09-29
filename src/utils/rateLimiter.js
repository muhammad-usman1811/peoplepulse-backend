const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const attempts = new Map();

const forgotPasswordLimiter = (req, res, next) => {
  const email = (req.body && req.body.email ? String(req.body.email) : '').trim().toLowerCase();
  const key = `${req.ip}:${email}`;
  const now = Date.now();
  const record = attempts.get(key);

  if (!record || now - record.firstAttempt > WINDOW_MS) {
    attempts.set(key, { count: 1, firstAttempt: now });
    return next();
  }

  if (record.count >= MAX_ATTEMPTS) {
    const retryAfterMinutes = Math.ceil((WINDOW_MS - (now - record.firstAttempt)) / 60000);
    return res.status(429).json({
      success: false,
      message: `Too many password reset requests. Please try again in ${retryAfterMinutes} minute(s).`,
    });
  }

  record.count += 1;
  return next();
};

setInterval(() => {
  const now = Date.now();
  for (const [key, record] of attempts.entries()) {
    if (now - record.firstAttempt > WINDOW_MS) attempts.delete(key);
  }
}, WINDOW_MS).unref();

module.exports = { forgotPasswordLimiter };
