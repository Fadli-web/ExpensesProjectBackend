import { randomUUID } from 'crypto';
import { applyCors } from '../../lib/cors.js';
import { requireUser } from '../../lib/auth.js';

export const config = { api: { bodyParser: { sizeLimit: '5mb' } } };

// POST /api/receipts/upload
// body: { image_base64, media_type? } -> menyimpan ke bucket privat "receipts/{user_id}/..."
// dan mengembalikan path + signed URL sementara untuk preview.
export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  const ctx = await requireUser(req, res);
  if (!ctx) return;
  const { supabase, user } = ctx;

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { image_base64, media_type } = req.body || {};
    if (!image_base64) return res.status(400).json({ error: 'image_base64 wajib diisi' });

    const ext = (media_type || 'image/jpeg').includes('png') ? 'png' : 'jpg';
    const path = `${user.id}/${randomUUID()}.${ext}`;
    const buffer = Buffer.from(image_base64, 'base64');

    const { error: uploadError } = await supabase.storage
      .from('receipts')
      .upload(path, buffer, { contentType: media_type || 'image/jpeg', upsert: false });
    if (uploadError) throw uploadError;

    const { data: signed, error: signError } = await supabase
      .storage.from('receipts')
      .createSignedUrl(path, 300);
    if (signError) throw signError;

    return res.status(201).json({ data: { path, signed_url: signed.signedUrl } });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
