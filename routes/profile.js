const express = require('express');
const router = express.Router();
const formidable = require('formidable');
const fs = require('fs');
const { requireAuth } = require('../middleware/auth');

const AVATAR_BUCKET = process.env.AVATAR_BUCKET || 'avatars';
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

// GET /api/profile
router.get('/', async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;
  const { user, supabase } = auth;

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, full_name, avatar_url, updated_at')
    .eq('id', user.id)
    .single();

  if (error) return res.status(400).json({ error: error.message });

  return res.status(200).json({
    id: user.id,
    email: user.email,
    full_name: profile?.full_name || '',
    avatar_url: profile?.avatar_url || null,
    updated_at: profile?.updated_at,
  });
});

// PUT /api/profile
router.put('/', async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;
  const { user, supabase } = auth;

  const { full_name, email } = req.body || {};

  if (email && email !== user.email) {
    const { error: emailErr } = await supabase.auth.updateUser({ email });
    if (emailErr) return res.status(400).json({ error: emailErr.message });
  }

  if (full_name !== undefined) {
    const { error: profileErr } = await supabase
      .from('profiles')
      .update({ full_name, updated_at: new Date().toISOString() })
      .eq('id', user.id);

    if (profileErr) return res.status(400).json({ error: profileErr.message });
  }

  return res.status(200).json({ message: 'Profile updated.' });
});

// PUT /api/profile/password
router.put('/password', async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;
  const { user, supabase } = auth;

  const { current_password, new_password } = req.body || {};
  if (!new_password || new_password.length < 8) {
    return res.status(400).json({ error: 'new_password must be at least 8 characters' });
  }
  if (!current_password) {
    return res.status(400).json({ error: 'current_password is required' });
  }

  const { error: verifyErr } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: current_password,
  });
  if (verifyErr) return res.status(401).json({ error: 'Current password is incorrect' });

  const { error } = await supabase.auth.updateUser({ password: new_password });
  if (error) return res.status(400).json({ error: error.message });

  return res.status(200).json({ message: 'Password updated.' });
});

// POST /api/profile/avatar
router.post('/avatar', async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;
  const { user, supabase } = auth;

  const form = formidable({ maxFileSize: MAX_SIZE });

  let fields, files;
  try {
    [fields, files] = await form.parse(req);
  } catch (err) {
    return res.status(400).json({ error: 'Failed to parse upload: ' + err.message });
  }

  const fileArr = files.avatar;
  const file = Array.isArray(fileArr) ? fileArr[0] : fileArr;
  if (!file) return res.status(400).json({ error: 'No file uploaded under field "avatar"' });

  if (!ALLOWED_TYPES.includes(file.mimetype)) {
    return res.status(400).json({ error: 'Only JPEG, PNG, or WEBP images are allowed' });
  }

  const ext = file.mimetype === 'image/png' ? 'png' : file.mimetype === 'image/webp' ? 'webp' : 'jpg';
  const path = `${user.id}/avatar-${Date.now()}.${ext}`;
  const buffer = fs.readFileSync(file.filepath);

  const { error: uploadErr } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(path, buffer, { contentType: file.mimetype, upsert: false });

  if (uploadErr) return res.status(400).json({ error: uploadErr.message });

  const { data: publicUrlData } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
  const avatarUrl = publicUrlData.publicUrl;

  const { data: currentProfile } = await supabase
    .from('profiles')
    .select('avatar_path')
    .eq('id', user.id)
    .single();

  const { error: updateErr } = await supabase
    .from('profiles')
    .update({ avatar_url: avatarUrl, avatar_path: path, updated_at: new Date().toISOString() })
    .eq('id', user.id);

  if (updateErr) return res.status(400).json({ error: updateErr.message });

  if (currentProfile?.avatar_path && currentProfile.avatar_path !== path) {
    await supabase.storage.from(AVATAR_BUCKET).remove([currentProfile.avatar_path]);
  }

  return res.status(200).json({ avatar_url: avatarUrl, message: 'Avatar updated.' });
});

module.exports = router;
