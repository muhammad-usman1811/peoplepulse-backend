// Calendar days, attendance dates, and displayed times all use this zone. Read once at
// load, after src/server.js has run dotenv and normalizeEnv().
const APP_TIMEZONE = process.env.APP_TIMEZONE || 'Asia/Karachi';

module.exports = { APP_TIMEZONE };
