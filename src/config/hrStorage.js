const { createClient } = require('@supabase/supabase-js');
let client;
module.exports = () => {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('HR storage requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  }
  client ||= createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client.storage.from(process.env.SUPABASE_BUCKET || 'hr-documents');
};
