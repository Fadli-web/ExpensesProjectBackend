const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const { requireAuth } = require('../middleware/auth');

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
