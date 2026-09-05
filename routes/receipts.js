const express = require('express');
const router = express.Router();
const formidable = require('formidable');
const fs = require('fs');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { requireAuth } = require('../middleware/auth');

const RECEIPT_BUCKET = process.env.RECEIPT_BUCKET || 'receipts';
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

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
router.post('/scan', async (req, res) => {
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
});

// POST /api/receipts/upload
router.post('/upload', async (req, res) => {
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
    .createSignedUrl(path, 60 * 60); // 1 hour validity

  return res.status(200).json({ receipt_path: path, receipt_url: signed?.signedUrl || null });
});

// GET /api/receipts/gallery
router.get('/gallery', async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;
  const { user, supabase } = auth;

  const {
    page = '1',
    limit = '20',
    category,
    search,
    start_date,
    end_date,
  } = req.query;

  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
  const from = (pageNum - 1) * limitNum;
  const to = from + limitNum - 1;

  let query = supabase
    .from('transactions')
    .select('id, merchant, amount, category, payment_method, transaction_date, notes, receipt_path, created_at', { count: 'exact' })
    .eq('user_id', user.id)
    .not('receipt_path', 'is', null)
    .order('transaction_date', { ascending: false })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (category) query = query.eq('category', category);
  if (search) query = query.ilike('merchant', `%${search}%`);
  if (start_date) query = query.gte('transaction_date', start_date);
  if (end_date) query = query.lte('transaction_date', end_date);

  const { data, error, count } = await query;
  if (error) return res.status(400).json({ error: error.message });

  const receipts = await Promise.all(
    (data || []).map(async (item) => {
      let receipt_url = null;
      if (item.receipt_path) {
        const { data: signed } = await supabase.storage
          .from(RECEIPT_BUCKET)
          .createSignedUrl(item.receipt_path, 60 * 60);
        receipt_url = signed?.signedUrl || null;
      }
      return {
        ...item,
        receipt_url,
      };
    })
  );

  return res.status(200).json({
    data: receipts,
    page: pageNum,
    limit: limitNum,
    total: count,
    total_pages: Math.ceil((count || 0) / limitNum),
  });
});

module.exports = router;
