// Values pasted into a hosting dashboard (or written by an editor that saves
// UTF-8 with a BOM) can arrive as "\uFEFFproduction" or "production\n". That
// silently breaks every `NODE_ENV === 'production'` check — production was
// returning stack traces because of exactly this. Only plain configuration
// values are cleaned here; secrets and keys are left byte-for-byte as set,
// because changing ENCRYPTION_KEY or SEARCH_INDEX_KEY would make existing
// encrypted names and search tokens unreadable.
const CONFIG_KEYS = [
  'NODE_ENV',
  'PORT',
  'APP_TIMEZONE',
  'CLIENT_URL',
  'APP_URL',
  'FRONTEND_URL',
  'JWT_EXPIRE',
  'ALLOW_DESTRUCTIVE_SEED',
  'DNS_SERVERS',
  'DOCUMENT_USER_STORAGE_QUOTA_BYTES',
  'DOCUMENT_TOTAL_STORAGE_QUOTA_BYTES',
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_SECURE',
  'EMAIL_USER',
];

const cleanValue = (value) => value.replace(/^\uFEFF/, '').trim();

const normalizeEnv = (env = process.env) => {
  for (const key of CONFIG_KEYS) {
    if (typeof env[key] === 'string') {
      env[key] = cleanValue(env[key]);
    }
  }
  return env;
};

module.exports = { CONFIG_KEYS, normalizeEnv };
