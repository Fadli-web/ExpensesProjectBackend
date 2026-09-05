const formidable = require('formidable');
const fs = require('fs');
const { requireAuth, applyCors } = require('../../middleware/auth');

module.exports.config = { api: { bodyParser: false } };

const RECEIPT_BUCKET = process.env.RECEIPT_BUCKET || 'receipts';
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE = 2 * 1024 * 1024; // 2MB — image should already be compressed client-side

// POST /api/receipts/upload  (multipart/form-data, field name: "receipt")
// Stores the (already client-side-compressed) receipt photo in the
// private "receipts" bucket and returns the storage path + a short-lived
// signed URL. Pass the returned `receipt_path` when creating the
// transaction via POST /api/transactions.
module.exports = async (req, res) => {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const auth = await requireAuth(req, res);
  if (!auth) return;
  const { user, supabase } = auth;

  const form = formidable({ maxFileSize: MAX_SIZE });
  let files;
  try {
    [, files] = await form.parse(req);
  } catch (err) {
    return res.status(400).json({ error: 'Failed to parse upload: ' + err.message });
  }

  const fileArr = files.receipt;
  const file = Array.isArray(fileArr) ? fileArr[0] : fileArr;
  if (!file) return res.status(400).json({ error: 'No file uploaded under field "receipt"' });
  if (!ALLOWED_TYPES.includes(file.mimetype)) {
    return res.status(400).json({ error: 'Only JPEG, PNG, or WEBP images are allowed' });
  }

  const ext = file.mimetype === 'image/png' ? 'png' : file.mimetype === 'image/webp' ? 'webp' : 'jpg';
  const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const buffer = fs.readFileSync(file.filepath);

  const { error: uploadErr } = await supabase.storage
    .from(RECEIPT_BUCKET)
    .upload(path, buffer, { contentType: file.mimetype });

  if (uploadErr) return res.status(400).json({ error: uploadErr.message });

  const { data: signed } = await supabase.storage
    .from(RECEIPT_BUCKET)
    .createSignedUrl(path, 60 * 10);

  return res.status(200).json({ receipt_path: path, receipt_url: signed?.signedUrl || null });
};
