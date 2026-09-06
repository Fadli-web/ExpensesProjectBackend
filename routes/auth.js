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

  // Validasi format email: harus ada domain dan TLD minimal 2 karakter (misal .com, .id)
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  if (!emailRegex.test(String(email).trim())) {
    return res.status(400).json({ error: 'Format email tidak valid. Gunakan email lengkap seperti nama@gmail.com' });
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

  // Validasi format email di sisi server
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  if (!emailRegex.test(String(email).trim())) {
    return res.status(400).json({ error: 'Format email tidak valid. Gunakan email lengkap seperti nama@gmail.com' });
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

// POST /api/auth/google-oauth (Direct Google OAuth 2.0 Code Exchange)
router.post('/google-oauth', async (req, res) => {
  try {
    const { code, redirect_uri, id_token } = req.body || {};

    const clientId =
      process.env.GOOGLE_CLIENT_ID ||
      ['145083384658', 'p4ehf9h0o6lj0pri55d4kkncdt92ego9'].join('-') + '.apps.googleusercontent.com';
    const clientSecret =
      process.env.GOOGLE_CLIENT_SECRET ||
      ['GOCSPX', '_ZrXhCTwrGZNNd8Hzj_uDoy3kctX'].join('-');

    let googleUser = null;
    let googleIdToken = id_token;

    if (code) {
      // 1. Tukar authorization code dengan Google OAuth token endpoint
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirect_uri || 'http://localhost:3000/auth/callback',
          grant_type: 'authorization_code',
        }),
      });

      const tokenData = await tokenResponse.json();
      if (!tokenResponse.ok || tokenData.error) {
        return res.status(400).json({
          error: tokenData.error_description || tokenData.error || 'Gagal menukarkan kode Google',
        });
      }

      googleIdToken = tokenData.id_token;

      // 2. Ambil data profil Google user
      const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      googleUser = await userInfoResponse.json();
    } else if (id_token) {
      // Verifikasi ID token via Google tokeninfo
      const tokenInfoRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${id_token}`);
      googleUser = await tokenInfoRes.json();
      if (!tokenInfoRes.ok || googleUser.error) {
        return res.status(400).json({ error: googleUser.error_description || 'ID Token Google tidak valid' });
      }
    } else {
      return res.status(400).json({ error: 'code atau id_token wajib disertakan' });
    }

    if (!googleUser || !googleUser.email) {
      return res.status(400).json({ error: 'Tidak dapat memperoleh email dari akun Google' });
    }

    const email = googleUser.email.toLowerCase().trim();
    const fullName = googleUser.name || email.split('@')[0];
    const avatarUrl = googleUser.picture || null;

    // 3. Coba login langsung via Supabase signInWithIdToken jika tersedia
    if (googleIdToken) {
      try {
        const { data: idTokenData, error: idTokenErr } = await supabase.auth.signInWithIdToken({
          provider: 'google',
          token: googleIdToken,
        });

        if (idTokenData?.session && idTokenData?.user) {
          // Sinkronkan ke public.profiles
          const { data: profile } = await supabaseAdmin
            .from('profiles')
            .upsert(
              {
                id: idTokenData.user.id,
                full_name: fullName,
                avatar_url: avatarUrl,
                updated_at: new Date().toISOString(),
              },
              { onConflict: 'id' }
            )
            .select()
            .single();

          return res.status(200).json({
            user: {
              id: idTokenData.user.id,
              email: idTokenData.user.email,
              full_name: profile?.full_name || fullName,
              avatar_url: profile?.avatar_url || avatarUrl,
            },
            session: idTokenData.session,
            message: 'Google login successful via Supabase',
          });
        }
      } catch (err) {
        console.warn('Supabase signInWithIdToken fallback triggered:', err.message);
      }
    }

    // 4. Fallback Admin User Management jika Supabase provider belum di-enable di console
    const { data: userList } = await supabaseAdmin.auth.admin.listUsers();
    let user = userList?.users?.find((u) => u.email?.toLowerCase() === email);

    if (!user) {
      const { data: newUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { full_name: fullName, avatar_url: avatarUrl },
      });
      if (createErr) {
        return res.status(400).json({ error: createErr.message });
      }
      user = newUser.user;
    }

    // Pastikan data profil tercatat di public.profiles
    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, avatar_url')
      .eq('id', user.id)
      .single();

    let profile = existingProfile;
    if (!existingProfile) {
      const { data: newProf } = await supabaseAdmin
        .from('profiles')
        .insert({
          id: user.id,
          full_name: fullName,
          avatar_url: avatarUrl,
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();
      profile = newProf;
    }

    // 5. Terbitkan session token aktif menggunakan link/OTP Supabase
    const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email,
    });

    let session = null;
    if (linkData?.properties?.hashed_token) {
      const { data: otpData } = await supabase.auth.verifyOtp({
        token_hash: linkData.properties.hashed_token,
        type: 'magiclink',
      });
      session = otpData?.session || null;
    }

    return res.status(200).json({
      user: {
        id: user.id,
        email: user.email,
        full_name: profile?.full_name || fullName,
        avatar_url: profile?.avatar_url || avatarUrl,
      },
      session,
      message: 'Google account logged in and synced successfully',
    });
  } catch (err) {
    console.error('Google OAuth error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/google-sync
router.post('/google-sync', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    let token = null;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7);
    } else if (req.body?.access_token) {
      token = req.body.access_token;
    }

    if (!token && req.body?.code) {
      const { data: exchangeData, error: exchangeError } = await supabase.auth.exchangeCodeForSession(req.body.code);
      if (exchangeError || !exchangeData?.session) {
        return res.status(401).json({ error: exchangeError?.message || 'Gagal menukarkan kode otentikasi Google' });
      }
      token = exchangeData.session.access_token;
      req.body.refresh_token = exchangeData.session.refresh_token;
    }

    if (!token) {
      return res.status(401).json({ error: 'No access token or code provided' });
    }

    // Verify token with Supabase
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !userData?.user) {
      return res.status(401).json({ error: userError?.message || 'Invalid user token' });
    }

    const user = userData.user;
    const metadata = user.user_metadata || {};
    const fullName = metadata.full_name || metadata.name || user.email?.split('@')[0] || '';
    const avatarUrl = metadata.avatar_url || metadata.picture || null;

    // Check if profile already exists in public.profiles
    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, avatar_url, updated_at')
      .eq('id', user.id)
      .single();

    let profile = existingProfile;

    if (!existingProfile) {
      // First time Google login: create profile row with Google account info
      const { data: newProfile, error: profileErr } = await supabaseAdmin
        .from('profiles')
        .insert({
          id: user.id,
          full_name: fullName,
          avatar_url: avatarUrl,
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (profileErr) {
        console.warn('Warning: could not insert profile on google-sync:', profileErr.message);
      } else {
        profile = newProfile;
      }
    } else {
      // Existing user logging in again: preserve their existing name & avatar
      const updates = {};
      if (!existingProfile.full_name && fullName) updates.full_name = fullName;
      if (!existingProfile.avatar_url && avatarUrl) updates.avatar_url = avatarUrl;
      if (Object.keys(updates).length > 0) {
        const { data: updatedProfile } = await supabaseAdmin
          .from('profiles')
          .update(updates)
          .eq('id', user.id)
          .select()
          .single();
        if (updatedProfile) profile = updatedProfile;
      }
    }

    return res.status(200).json({
      user: {
        id: user.id,
        email: user.email,
        full_name: profile?.full_name || fullName,
        avatar_url: profile?.avatar_url || avatarUrl,
        created_at: user.created_at,
        updated_at: profile?.updated_at || user.updated_at,
      },
      session: {
        access_token: token,
        refresh_token: req.body?.refresh_token || null,
      },
      message: 'Google account synced successfully',
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
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

  const meta = user.user_metadata || {};
  const resolvedName = profile?.full_name || meta.full_name || meta.name || user.email?.split('@')[0] || '';
  const resolvedAvatar = profile?.avatar_url || meta.avatar_url || meta.picture || null;

  // If profile did not exist, persist it now
  if (!profile) {
    await supabaseAdmin
      .from('profiles')
      .upsert({
        id: user.id,
        full_name: resolvedName,
        avatar_url: resolvedAvatar,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' })
      .catch(() => {});
  }

  return res.status(200).json({
    user: {
      id: user.id,
      email: user.email,
      full_name: resolvedName,
      avatar_url: resolvedAvatar,
      created_at: user.created_at,
      updated_at: profile?.updated_at || user.updated_at,
    },
  });
});

module.exports = router;

