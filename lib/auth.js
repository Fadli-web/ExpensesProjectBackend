import { getSupabaseForUser } from './supabase.js';

/**
 * Mengambil token dari header Authorization, memverifikasi ke Supabase Auth,
 * dan mengembalikan { supabase, user, token } jika valid.
 * Jika tidak valid, langsung mengirim response 401 dan mengembalikan null -
 * caller cukup `if (!ctx) return;`
 */
export async function requireUser(req, res) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    res.status(401).json({ error: 'Header Authorization Bearer token wajib diisi' });
    return null;
  }

  const supabase = getSupabaseForUser(token);
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data?.user) {
    res.status(401).json({ error: 'Token tidak valid atau sudah kedaluwarsa' });
    return null;
  }

  return { supabase, user: data.user, token };
}
