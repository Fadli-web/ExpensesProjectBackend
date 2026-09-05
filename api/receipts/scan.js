const { requireAuth, applyCors } = require('../../middleware/auth');

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';

const CATEGORIES = [
  'Belanja Harian', 'Transportasi', 'Makanan & Minuman', 'Tagihan & Utilitas',
  'Kesehatan', 'Hiburan', 'Pendidikan', 'Belanja Online', 'Lainnya',
];

const SYSTEM_PROMPT = `Kamu adalah mesin OCR + kategorisasi struk belanja untuk aplikasi pencatat keuangan.
Baca gambar struk yang diberikan dan kembalikan HANYA satu objek JSON valid, tanpa teks lain,
tanpa markdown code fence, dengan skema persis berikut:
{
  "merchant": string,
  "amount": number,              // total akhir transaksi, dalam angka (bukan string)
  "transaction_date": string,    // format YYYY-MM-DD, tebak tahun berjalan jika tidak tercetak
  "category": string,            // salah satu dari: ${CATEGORIES.join(', ')}
  "items": [ { "name": string, "qty": number, "price": number } ],
  "confidence": number           // 0-1, seberapa yakin kamu terhadap hasil bacaan ini
}
Jika sebuah field tidak terbaca, isi dengan null (kecuali items: pakai array kosong).`;

// POST /api/receipts/scan
// body: { image_base64: string, media_type: "image/jpeg" | "image/png" | "image/webp" }
//
// This is a *preview* step: it does NOT save anything. The frontend shows
// the auto-filled form next to the receipt photo (per the "Interactive
// Receipt Previewer" spec) and only calls POST /api/transactions once the
// user confirms the data is correct.
module.exports = async (req, res) => {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const auth = await requireAuth(req, res);
  if (!auth) return;

  const { image_base64, media_type } = req.body || {};
  if (!image_base64) return res.status(400).json({ error: 'image_base64 is required' });
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'Server is missing ANTHROPIC_API_KEY' });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: media_type || 'image/jpeg', data: image_base64 },
              },
              { type: 'text', text: 'Baca struk ini dan kembalikan JSON sesuai skema.' },
            ],
          },
        ],
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(502).json({ error: data?.error?.message || 'AI vision request failed' });
    }

    const textBlock = (data.content || []).find((c) => c.type === 'text');
    const raw = (textBlock?.text || '').replace(/```json|```/g, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return res.status(502).json({ error: 'Could not parse AI response as JSON', raw });
    }

    return res.status(200).json({ data: parsed });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
