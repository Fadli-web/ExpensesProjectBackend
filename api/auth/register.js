import { applyCors } from '../../lib/cors.js';
import { supabaseAdmin } from '../../lib/db.js';
import { createClient } from '@supabase/supabase-js';

// POST /api/auth/register
// Body: { name, email, password }
export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { name, email, password } = req.body || {};

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Nama, email, dan password wajib diisi' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password minimal 6 karakter' });
    }

    // Daftarkan user ke Supabase Auth
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: email.toLowerCase().trim(),
      password,
      email_confirm: true, // langsung konfirmasi tanpa email verifikasi
      user_metadata: { name: name.trim() },
    });

    if (error) {
      // Tangani error email sudah terdaftar
      if (error.message.toLowerCase().includes('already registered') || error.code === 'email_exists') {
        return res.status(400).json({ error: 'Email sudah terdaftar. Silakan login.' });
      }
      return res.status(400).json({ error: error.message });
    }

    const newUser = data.user;

    // Buat profil di tabel profiles
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .upsert({
        id: newUser.id,
        name: name.trim(),
        avatar_url: null,
      });

    if (profileError) {
      console.error('Gagal membuat profil:', profileError.message);
      // Tetap lanjut — profil akan dibuat saat pertama kali akses
    }

    // Login untuk mendapatkan access_token
    const supabaseAnon = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
    const { data: signInData, error: signInError } = await supabaseAnon.auth.signInWithPassword({
      email: email.toLowerCase().trim(),
      password,
    });

    if (signInError) {
      // User berhasil dibuat tapi gagal login otomatis — kembalikan tanpa token
      return res.status(201).json({
        success: true,
        message: 'Registrasi berhasil. Silakan login.',
        user: {
          id: newUser.id,
          name: name.trim(),
          email: newUser.email,
          avatar_url: null,
          created_at: newUser.created_at,
        },
      });
    }

    return res.status(201).json({
      success: true,
      message: 'Registrasi berhasil',
      user: {
        id: signInData.user.id,
        name: name.trim(),
        email: signInData.user.email,
        avatar_url: null,
        created_at: signInData.user.created_at,
      },
      access_token: signInData.session.access_token,
      refresh_token: signInData.session.refresh_token,
      expires_at: signInData.session.expires_at,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Terjadi kesalahan server: ' + err.message });
  }
}
