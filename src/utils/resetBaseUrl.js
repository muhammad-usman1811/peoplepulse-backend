// Resolves the base URL that password-reset links are built from.
//
// The request's Host header is deliberately not trusted in production: a forged Host
// would put an attacker's domain into the reset link that gets emailed to the real
// account owner, who would hand over their token by clicking it. Production therefore
// uses an explicitly configured URL, then the deployment URL the platform itself
// supplies (which no request can influence - src/server.js already trusts it for CORS),
// and only refuses to build a link when neither exists.
//
// Without the platform fallback, a deployment that never set FRONTEND_URL answered
// forgot-password with its generic "link has been dispatched" message while sending
// nothing at all. The API serves reset-password.html itself, so its own origin is a
// working destination.
const resolveResetBaseUrl = (env = process.env, requestOrigin = '') => {
  const configured = env.FRONTEND_URL || env.APP_URL;
  const platformHost = env.VERCEL_PROJECT_PRODUCTION_URL || env.VERCEL_URL;
  const candidate =
    configured ||
    (env.NODE_ENV === 'production' ? (platformHost ? `https://${platformHost}` : '') : requestOrigin);

  try {
    const parsed = new URL(candidate);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href.replace(/\/$/, '') : '';
  } catch {
    return '';
  }
};

// Logged once per cold start so a deployment that cannot send reset links says so in
// its own logs, instead of the breakage only surfacing as users never getting an email.
const warnIfResetLinksUnavailable = (env = process.env, log = console.warn) => {
  if (env.NODE_ENV !== 'production') return false;

  const reasons = [];
  if (!resolveResetBaseUrl(env)) {
    reasons.push('no usable FRONTEND_URL, APP_URL, or platform deployment URL');
  }
  if (!env.EMAIL_USER || !env.EMAIL_PASS) {
    reasons.push('EMAIL_USER/EMAIL_PASS are not configured');
  }
  if (reasons.length) {
    log(
      `[Startup] Password reset links cannot be sent: ${reasons.join('; ')}. ` +
        'POST /api/auth/forgot-password will keep answering with its generic success ' +
        'message while sending nothing.'
    );
  }
  return reasons.length > 0;
};

module.exports = { resolveResetBaseUrl, warnIfResetLinksUnavailable };
