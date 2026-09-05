import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

/**
 * Middleware untuk memvalidasi token Supabase dari header Authorization.
 * Mengembalikan { user, token, supabase } jika valid, atau null jika gagal.
 *
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 * @returns {Promise<{ user: object, token: string, supabase: import('@supabase/supabase-js').SupabaseClient } | null>}
 */
export async function requireUser(req, res) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

  if (!token) {
    res.status(401).json({ error: 'Header Authorization Bearer token wajib diisi' });
    return null;
  }

  try {
    // Buat client Supabase dengan token user untuk validasi
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      res.status(401).json({ error: 'Token tidak valid atau sudah kedaluwarsa' });
      return null;
    }

    return { user, token, supabase };
  } catch (err) {
    res.status(401).json({ error: 'Token tidak valid: ' + err.message });
    return null;
  }
}
