const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || 'placeholder-key';

const supabaseAdmin = createClient(
  supabaseUrl,
  supabaseKey,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

module.exports = supabaseAdmin;
module.exports.supabaseAdmin = supabaseAdmin;

