import { applyCors } from '../../lib/cors.js';
import { createClient } from '@supabase/supabase-js';

// POST /api/auth/register
// Body: { "email": "...", "password": "..." }
export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'email dan password wajib diisi' });
  }

  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({ error: 'SUPABASE_URL atau SUPABASE_ANON_KEY belum di-set di environment variables' });
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
      return res.status(400).json({ error: error.message });
    }

    return res.status(200).json({
      message: 'Registrasi berhasil',
      user: data.user,
      session: data.session,
      access_token: data.session?.access_token || null,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
