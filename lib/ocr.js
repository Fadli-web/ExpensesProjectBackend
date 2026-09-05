import { GoogleGenerativeAI } from '@google/generative-ai';

const SYSTEM_PROMPT = `Kamu adalah mesin OCR struk belanja. Baca gambar struk yang diberikan dan balas HANYA dengan JSON valid (minified, tanpa markdown, tanpa penjelasan tambahan) sesuai skema berikut:

{"merchant": string, "amount": number, "transaction_date": "YYYY-MM-DD" atau null, "category": string, "items": string[], "payment_method": string atau null}

Ketentuan:
- "merchant" adalah nama toko / tempat belanja / vendor.
- "amount" adalah total akhir yang dibayar (dalam angka number, tanpa simbol mata uang atau pemisah ribuan).
- "category" harus salah satu dari: "Transportasi", "Belanja Harian", "Makanan & Minuman", "Kesehatan", "Hiburan", "Tagihan", "Lainnya".
- "items" adalah daftar singkat nama barang/jasa pada struk (array of string, boleh kosong [] jika tidak terbaca).
- Jika suatu field benar-benar tidak terbaca, isi dengan null (atau [] khusus untuk items).
- Jangan menambahkan teks apa pun di luar objek JSON.`;

/**
 * Mengirim gambar struk (base64) ke model Gemini 1.5 Flash vision dan mengembalikan objek
 * hasil parsing yang siap dipakai untuk auto-fill form transaksi.
 */
export async function scanReceipt(base64Image, mediaType = 'image/jpeg') {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY belum di-set di environment variables');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-1.5-flash',
    systemInstruction: SYSTEM_PROMPT,
    generationConfig: {
      responseMimeType: 'application/json',
    },
  });

  // Bersihkan data URL prefix jika dikirim dari frontend (contoh: "data:image/jpeg;base64,...")
  let cleanBase64 = base64Image;
  if (cleanBase64.includes(';base64,')) {
    const parts = cleanBase64.split(';base64,');
    cleanBase64 = parts[1];
    if (parts[0].startsWith('data:')) {
      mediaType = parts[0].slice(5);
    }
  }

  const imagePart = {
    inlineData: {
      data: cleanBase64,
      mimeType: mediaType || 'image/jpeg',
    },
  };

  const result = await model.generateContent([
    imagePart,
    'Baca struk ini dan kembalikan JSON sesuai skema di atas.',
  ]);

  const responseText = result.response.text();
  if (!responseText) throw new Error('Model Gemini tidak mengembalikan respon teks');

  const cleaned = responseText.replace(/```json|```/g, '').trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error('Gagal parsing hasil OCR Gemini menjadi JSON: ' + cleaned);
  }

  return parsed;
}

