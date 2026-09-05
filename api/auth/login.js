import { applyCors } from '../../lib/cors.js';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../../lib/db.js';

// POST /api/auth/login
// Body: { email, password }
export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ error: 'Email dan password wajib diisi' });
    }

    // Login via Supabase Auth
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.toLowerCase().trim(),
      password,
    });

    if (error) {
      return res.status(401).json({ error: 'Email atau password salah' });
    }

    const { user, session } = data;

    // Ambil data profil dari tabel profiles
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('name, avatar_url, created_at, updated_at')
      .eq('id', user.id)
      .single();

    // Jika profil belum ada, buat otomatis
    if (!profile) {
      await supabaseAdmin.from('profiles').upsert({
        id: user.id,
        name: user.user_metadata?.name || user.email.split('@')[0],
        avatar_url: null,
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Login berhasil',
      user: {
        id: user.id,
        name: profile?.name || user.user_metadata?.name || user.email.split('@')[0],
        email: user.email,
        avatar_url: profile?.avatar_url || null,
        created_at: user.created_at,
      },
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Terjadi kesalahan server: ' + err.message });
  }
}
