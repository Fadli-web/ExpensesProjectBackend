const formidable = require('formidable');
const fs = require('fs');
const { requireAuth, applyCors } = require('../../middleware/auth');

// Vercel must not pre-parse the body — formidable needs the raw stream
// to read the multipart/form-data upload.
module.exports.config = { api: { bodyParser: false } };

const AVATAR_BUCKET = process.env.AVATAR_BUCKET || 'avatars';
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

// POST /api/profile/avatar  (multipart/form-data, field name: "avatar")
//
// The uploaded photo is stored in Supabase Storage under
// avatars/<user_id>/avatar-<timestamp>.<ext>, and its public URL is saved
// on profiles.avatar_url. Because the file lives in Supabase (not on the
// user's device/browser), it is available identically after logging in
// from any other device, as long as it's the same account.
module.exports = async (req, res) => {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

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

  // Fetch old avatar path so we can delete the now-unused file
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
};
