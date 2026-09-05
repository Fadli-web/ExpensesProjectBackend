import { applyCors } from '../../lib/cors.js';
import { requireUser } from '../../lib/auth.js';
import { scanReceipt } from '../../lib/ocr.js';
import { guessCategory } from '../../lib/categorize.js';

export const config = { api: { bodyParser: { sizeLimit: '2mb' } } };

// POST /api/receipts/scan
// body: { image_base64, media_type? } - kirim gambar yang SUDAH dikompres di client (<300KB)
// Hanya membaca & mengembalikan hasil parsing, TIDAK menyimpan transaksi.
export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  const ctx = await requireUser(req, res);
  if (!ctx) return;

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { image_base64, media_type } = req.body || {};
    if (!image_base64) return res.status(400).json({ error: 'image_base64 wajib diisi' });

    const parsed = await scanReceipt(image_base64, media_type || 'image/jpeg');
    if (!parsed.category) {
      parsed.category = guessCategory(parsed.merchant, parsed.items || []);
    }
    return res.status(200).json({ data: parsed });
  } catch (err) {
    return res.status(500).json({ error: 'Gagal membaca struk: ' + err.message });
  }
}
