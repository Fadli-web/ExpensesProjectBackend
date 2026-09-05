// Creates a Supabase client scoped to the requesting user's own JWT.
// This makes Postgres Row Level Security (auth.uid()) work correctly,
// so a user can only ever read/write their own rows.
const { createClient } = require('@supabase/supabase-js');

function supabaseForUser(accessToken) {
  return createClient(
    process.env.SUPABASE_URL || 'https://placeholder.supabase.co',
    process.env.SUPABASE_ANON_KEY || 'placeholder-key',
    {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    }
  );
}


module.exports = { supabaseForUser };
