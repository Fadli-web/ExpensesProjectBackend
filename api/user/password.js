import { applyCors } from '../../lib/cors.js';
import { requireUser } from '../../lib/auth.js';
import { createClient } from '@supabase/supabase-js';

// PUT /api/user/password
// Body: { current_password, new_password }
export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  const auth = await requireUser(req, res);
  if (!auth) return;
  const { user, token } = auth;

  if (req.method !== 'PUT' && req.method !== 'POST') {
    res.setHeader('Allow', 'PUT, POST, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { current_password, new_password } = req.body || {};

    if (!current_password || !new_password) {
      return res.status(400).json({ error: 'Password saat ini dan password baru wajib diisi' });
    }

    if (new_password.length < 6) {
      return res.status(400).json({ error: 'Password baru minimal 6 karakter' });
    }

    // Verifikasi password lama dengan cara re-login
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: current_password,
    });

    if (verifyError) {
      return res.status(400).json({ error: 'Password saat ini tidak sesuai' });
    }

    // Update password menggunakan session user yang aktif
    const userClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { error: updateError } = await userClient.auth.updateUser({
      password: new_password,
    });

    if (updateError) {
      return res.status(500).json({ error: 'Gagal memperbarui password: ' + updateError.message });
    }

    return res.status(200).json({
      success: true,
      message: 'Password berhasil diperbarui',
    });
  } catch (err) {
    return res.status(500).json({ error: 'Gagal mengubah password: ' + err.message });
  }
}
