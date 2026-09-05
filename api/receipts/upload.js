import { applyCors } from '../../lib/cors.js';
import { requireUser } from '../../lib/auth.js';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '5mb',
    },
  },
};

// POST /api/receipts/upload
// body: { image_base64, media_type? }
// Memformat dan mengembalikan data image struk yang siap disimpan ke field receipt_image saat membuat transaksi.
export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  const auth = await requireUser(req, res);
  if (!auth) return;

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { image_base64, media_type = 'image/jpeg' } = req.body || {};
    if (!image_base64) {
      return res.status(400).json({ error: 'image_base64 wajib diisi' });
    }

    let formattedImage = image_base64;
    if (!formattedImage.startsWith('data:image/')) {
      formattedImage = `data:${media_type};base64,${image_base64}`;
    }

    return res.status(200).json({
      success: true,
      message: 'Foto struk siap digunakan',
      data: {
        receipt_image: formattedImage,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: 'Gagal memproses gambar: ' + err.message });
  }
}
