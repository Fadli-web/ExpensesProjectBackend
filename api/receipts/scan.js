const { requireAuth, applyCors } = require('../../middleware/auth');
const { GoogleGenerativeAI } = require('@google/generative-ai');

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
// Ini adalah langkah *preview*: TIDAK menyimpan apapun. Frontend menampilkan
// form yang sudah terisi otomatis dan baru menyimpan lewat POST /api/transactions
// setelah user mengkonfirmasi datanya benar.
module.exports = async (req, res) => {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const auth = await requireAuth(req, res);
  if (!auth) return;

  const { image_base64, media_type } = req.body || {};
  if (!image_base64) return res.status(400).json({ error: 'image_base64 is required' });

  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ error: 'Server is missing GEMINI_API_KEY' });
  }

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
      model: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
    });

    // Hapus prefix data URL jika ada (ambil hanya base64 murni)
    let base64Data = image_base64;
    if (base64Data.includes(',')) {
      base64Data = base64Data.split(',')[1];
    }

    const mimeType = media_type || 'image/jpeg';

    const result = await model.generateContent([
      SYSTEM_PROMPT,
      {
        inlineData: {
          mimeType,
          data: base64Data,
        },
      },
    ]);

    const raw = result.response.text().replace(/```json|```/g, '').trim();

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
