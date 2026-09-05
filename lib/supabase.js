import { createClient } from '@supabase/supabase-js';

/**
 * Client yang "berjalan sebagai" user tertentu (JWT dari header Authorization).
 * Semua query lewat client ini otomatis tunduk pada Row Level Security (RLS) -
 * user hanya bisa melihat/mengubah datanya sendiri.
 */
export function getSupabaseForUser(accessToken) {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Client dengan service role key (bypass RLS).
 * HANYA dipakai untuk operasi admin internal (mis. hapus file storage
 * setelah transaksi dihapus). Jangan pernah expose token/hasil client ini ke user.
 */
export function getSupabaseAdmin() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
