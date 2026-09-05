// Server-only client using the SERVICE ROLE key.
// Bypasses Row Level Security - use ONLY for trusted server operations
// (e.g. generating signed URLs, admin-level storage cleanup).
// NEVER expose SUPABASE_SERVICE_ROLE_KEY to the frontend.
const { createClient } = require('@supabase/supabase-js');

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

module.exports = { supabaseAdmin };
