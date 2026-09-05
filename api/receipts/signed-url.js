import { applyCors } from '../../lib/cors.js';
import { requireUser } from '../../lib/auth.js';

// GET /api/receipts/signed-url?path=user_id/xxxx.jpg
// Dipakai galeri arsip struk saat butuh menampilkan gambar (signed URL expired setelah 5 menit).
export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  const ctx = await requireUser(req, res);
  if (!ctx) return;
  const { supabase } = ctx;

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { path } = req.query;
    if (!path) return res.status(400).json({ error: 'path wajib diisi' });

    const { data, error } = await supabase.storage.from('receipts').createSignedUrl(path, 300);
    if (error) throw error;

    return res.status(200).json({ data: { signed_url: data.signedUrl, expires_in: 300 } });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
