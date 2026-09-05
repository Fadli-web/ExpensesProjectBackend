const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const { requireAuth } = require('../middleware/auth');
const supabaseAdmin = require('../lib/supabaseAdmin');

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://placeholder.supabase.co',
  process.env.SUPABASE_ANON_KEY || 'placeholder-key'
);

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { email, password, full_name } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  if (typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ error: 'Password should be at least 6 characters' });
  }

  // Gunakan supabaseAdmin jika SUPABASE_SERVICE_ROLE_KEY tersedia.
  // Ini otomatis mengonfirmasi email (email_confirm: true) dan TIDAK mengirim email konfirmasi,
  // sehingga mencegah error "email rate limit exceeded" dari batas kirim email gratis Supabase.
  const hasServiceRole =
    process.env.SUPABASE_SERVICE_ROLE_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY !== 'placeholder-key';

  if (hasServiceRole) {
    const { data: adminData, error: adminError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: full_name || '' },
    });

    if (adminError) {
      return res.status(adminError.status || 400).json({ error: adminError.message });
    }

    // Login otomatis untuk menghasilkan session & access_token aktif
    const { data: sessionData, error: loginError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (loginError) {
      return res.status(200).json({
        user: adminData.user,
        session: null,
        message: 'Registered successfully. Please login with your credentials.',
      });
    }

    return res.status(200).json({
      user: sessionData.user,
      session: sessionData.session,
      message: 'Registered and logged in.',
    });
  }

  // Fallback standar ke signUp jika service role tidak tersedia
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: full_name || '' } },
  });

  if (error) return res.status(400).json({ error: error.message });

  return res.status(200).json({
    user: data.user,
    session: data.session,
    message: data.session
      ? 'Registered and logged in.'
      : 'Registered. Please check your email to confirm your account.',
  });
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return res.status(401).json({ error: error.message });

  return res.status(200).json({
    user: data.user,
    session: data.session,
  });
});

// POST /api/auth/logout
router.post('/logout', async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  await auth.supabase.auth.signOut();
  return res.status(200).json({ message: 'Logged out successfully' });
});

// POST /api/auth/refresh
router.post('/refresh', async (req, res) => {
  const { refresh_token } = req.body || {};
  if (!refresh_token) {
    return res.status(400).json({ error: 'refresh_token is required' });
  }

  const { data, error } = await supabase.auth.refreshSession({ refresh_token });
  if (error) return res.status(401).json({ error: error.message });

  return res.status(200).json({ session: data.session });
});

// GET /api/auth/me
router.get('/me', async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;
  const { user, supabase: userSb } = auth;

  const { data: profile, error } = await userSb
    .from('profiles')
    .select('full_name, avatar_url, updated_at')
    .eq('id', user.id)
    .single();

  if (error && error.code !== 'PGRST116') {
    return res.status(400).json({ error: error.message });
  }

  return res.status(200).json({
    user: {
      id: user.id,
      email: user.email,
      full_name: profile?.full_name || user.user_metadata?.full_name || user.user_metadata?.name || '',
      avatar_url: profile?.avatar_url || user.user_metadata?.avatar_url || null,
      created_at: user.created_at,
      updated_at: profile?.updated_at || user.updated_at,
    },
  });
});

module.exports = router;
