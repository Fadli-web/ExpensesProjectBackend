const express = require('express');
const router = express.Router();
const formidable = require('formidable');
const fs = require('fs');
const os = require('os');
const { requireAuth } = require('../middleware/auth');
const supabaseAdmin = require('../lib/supabaseAdmin');

const AVATAR_BUCKET = process.env.AVATAR_BUCKET || 'avatars';
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

// GET /api/profile
router.get('/', async (req, res) => {
  try {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    const { user } = auth;

    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, avatar_url, updated_at')
      .eq('id', user.id)
      .single();

    if (error && error.code !== 'PGRST116') {
      return res.status(400).json({ error: error.message });
    }

    const meta = user.user_metadata || {};
    const fullName = profile?.full_name || meta.full_name || meta.name || user.email?.split('@')[0] || '';
    const avatarUrl = profile?.avatar_url || meta.avatar_url || meta.picture || null;

    if (!profile) {
      await supabaseAdmin
        .from('profiles')
        .upsert({
          id: user.id,
          full_name: fullName,
          avatar_url: avatarUrl,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'id' })
        .catch(() => {});
    }

    return res.status(200).json({
      id: user.id,
      email: user.email,
      full_name: fullName,
      avatar_url: avatarUrl,
      updated_at: profile?.updated_at || new Date().toISOString(),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// PUT /api/profile
router.put('/', async (req, res) => {
  try {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    const { user, supabase } = auth;

    const { full_name, email } = req.body || {};

    if (email && email !== user.email) {
      const { error: emailErr } = await supabase.auth.updateUser({ email });
      if (emailErr) return res.status(400).json({ error: emailErr.message });
    }

    if (full_name !== undefined) {
      const { error: profileErr } = await supabaseAdmin
        .from('profiles')
        .upsert({
          id: user.id,
          full_name,
          updated_at: new Date().toISOString(),
        });

      if (profileErr) return res.status(400).json({ error: profileErr.message });
    }

    const { data: updatedProfile } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, avatar_url, updated_at')
      .eq('id', user.id)
      .single();

    return res.status(200).json({
      message: 'Profile updated.',
      user: {
        id: user.id,
        email: email || user.email,
        full_name: updatedProfile?.full_name || full_name || '',
        avatar_url: updatedProfile?.avatar_url || null,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// PUT /api/profile/password
router.put('/password', async (req, res) => {
  try {
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
    if (verifyErr) return res.status(401).json({ error: 'Password saat ini salah' });

    const { error } = await supabase.auth.updateUser({ password: new_password });
    if (error) return res.status(400).json({ error: error.message });

    return res.status(200).json({ message: 'Password berhasil diperbarui.' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/profile/avatar
router.post('/avatar', async (req, res) => {
  try {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    const { user } = auth;

    let buffer;
    let mimetype = 'image/jpeg';
    let ext = 'jpg';

    // 1. Direct JSON base64 support (recommended for serverless)
    if (req.body?.image_base64 || req.body?.avatar_base64) {
      let b64 = req.body.image_base64 || req.body.avatar_base64;
      if (b64.includes(',')) {
        const match = b64.match(/data:(image\/\w+);base64,/);
        if (match) mimetype = match[1];
        b64 = b64.split(',')[1];
      }
      if (req.body.media_type) mimetype = req.body.media_type;
      ext = mimetype === 'image/png' ? 'png' : mimetype === 'image/webp' ? 'webp' : 'jpg';
      buffer = Buffer.from(b64, 'base64');
    } else {
      // 2. Multipart/form-data support with OS temp directory
      const form = formidable({
        maxFileSize: MAX_SIZE,
        uploadDir: os.tmpdir(),
        keepExtensions: true,
      });

      let files;
      try {
        [, files] = await form.parse(req);
      } catch (err) {
        return res.status(400).json({ error: 'Gagal memproses file unggahan: ' + err.message });
      }

      const fileArr = files.avatar;
      const file = Array.isArray(fileArr) ? fileArr[0] : fileArr;
      if (!file) return res.status(400).json({ error: 'Tidak ada file dalam field "avatar"' });

      if (!ALLOWED_TYPES.includes(file.mimetype)) {
        return res.status(400).json({ error: 'Hanya format JPEG, PNG, atau WEBP yang diperbolehkan' });
      }

      mimetype = file.mimetype;
      ext = mimetype === 'image/png' ? 'png' : mimetype === 'image/webp' ? 'webp' : 'jpg';
      buffer = fs.readFileSync(file.filepath);
    }

    const path = `${user.id}/avatar-${Date.now()}.${ext}`;

    const { error: uploadErr } = await supabaseAdmin.storage
      .from(AVATAR_BUCKET)
      .upload(path, buffer, { contentType: mimetype, upsert: true });

    if (uploadErr) {
      return res.status(400).json({ error: 'Gagal mengunggah ke storage: ' + uploadErr.message });
    }

    const { data: publicUrlData } = supabaseAdmin.storage.from(AVATAR_BUCKET).getPublicUrl(path);
    const avatarUrl = publicUrlData.publicUrl;

    const { data: currentProfile } = await supabaseAdmin
      .from('profiles')
      .select('avatar_path')
      .eq('id', user.id)
      .single();

    const { error: updateErr } = await supabaseAdmin
      .from('profiles')
      .upsert({
        id: user.id,
        avatar_url: avatarUrl,
        avatar_path: path,
        updated_at: new Date().toISOString(),
      });

    if (updateErr) {
      return res.status(400).json({ error: 'Gagal memperbarui profil: ' + updateErr.message });
    }

    if (currentProfile?.avatar_path && currentProfile.avatar_path !== path) {
      await supabaseAdmin.storage.from(AVATAR_BUCKET).remove([currentProfile.avatar_path]).catch(() => {});
    }

    return res.status(200).json({ avatar_url: avatarUrl, message: 'Avatar berhasil diperbarui' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
