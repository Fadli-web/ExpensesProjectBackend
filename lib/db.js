import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('SUPABASE_URL dan SUPABASE_ANON_KEY wajib di-set di environment variables');
}

/**
 * Membuat Supabase client yang menggunakan token user (untuk operasi RLS).
 * Gunakan ini untuk query yang membutuhkan autentikasi user.
 * @param {string} accessToken - Bearer token dari Supabase Auth
 */
export function createUserClient(accessToken) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

/**
 * Supabase Admin client menggunakan service_role key.
 * Bypass RLS — HANYA gunakan di server-side untuk operasi admin
 * seperti insert profil saat registrasi.
 */
export const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});
