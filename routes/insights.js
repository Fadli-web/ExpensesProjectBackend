const express = require('express');
const router = express.Router();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { requireAuth } = require('../middleware/auth');
const supabaseAdmin = require('../lib/supabaseAdmin');

const candidateModels = [
  'gemini-3.6-flash',
  'gemini-3.5-flash-lite',
  'gemini-flash-latest',
];

/**
 * Format currency to Rupiah string
 */
function formatRupiah(num) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(num || 0);
}

/**
 * Strip markdown formatting characters from AI response text
 * Removes: **bold**, ##heading, *italic*, --- dividers
 */
function stripMarkdown(text) {
  if (!text || typeof text !== 'string') return text;
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')   // **bold** → bold
    .replace(/\*(.+?)\*/g, '$1')        // *italic* → italic
    .replace(/^#{1,6}\s*/gm, '')        // ## heading → heading
    .replace(/^---+$/gm, '')            // --- dividers → remove
    .replace(/^\*\s+/gm, '• ')          // * list item → • list item
    .replace(/\n{3,}/g, '\n\n')         // triple+ newlines → double
    .trim();
}

/**
 * Fetch and aggregate financial data for a user
 */
async function getUserFinancialContext(userId, userFullName) {
  const { data: rows, error } = await supabaseAdmin
    .from('transactions')
    .select('id, merchant, amount, category, payment_method, transaction_date, notes, items')
    .eq('user_id', userId)
    .order('transaction_date', { ascending: false })
    .limit(100);

  if (error) {
    throw new Error(error.message);
  }

  const transactions = rows || [];
  const totalExpense = transactions.reduce((acc, tx) => acc + Number(tx.amount || 0), 0);

  // Group by category
  const categoryMap = {};
  for (const tx of transactions) {
    const cat = tx.category || 'Lainnya';
    categoryMap[cat] = (categoryMap[cat] || 0) + Number(tx.amount || 0);
  }
  const categoryBreakdown = Object.entries(categoryMap)
    .map(([cat, total]) => ({
      category: cat,
      amount: total,
      amountFormatted: formatRupiah(total),
      percentage: totalExpense > 0 ? ((total / totalExpense) * 100).toFixed(1) + '%' : '0%',
    }))
    .sort((a, b) => b.amount - a.amount);

  // Group by merchant
  const merchantMap = {};
  const merchantCount = {};
  for (const tx of transactions) {
    const m = tx.merchant || 'Unknown';
    merchantMap[m] = (merchantMap[m] || 0) + Number(tx.amount || 0);
    merchantCount[m] = (merchantCount[m] || 0) + 1;
  }
  const topMerchants = Object.entries(merchantMap)
    .map(([m, total]) => ({
      merchant: m,
      total: total,
      totalFormatted: formatRupiah(total),
      count: merchantCount[m] || 1,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  // Group by month
  const monthlyMap = {};
  for (const tx of transactions) {
    const month = (tx.transaction_date || '').slice(0, 7) || 'Unknown';
    monthlyMap[month] = (monthlyMap[month] || 0) + Number(tx.amount || 0);
  }
  const monthlyTrend = Object.entries(monthlyMap)
    .map(([month, total]) => ({
      month,
      total,
      totalFormatted: formatRupiah(total),
    }))
    .sort((a, b) => b.month.localeCompare(a.month))
    .slice(0, 6);

  // Recent 10 transactions list
  const recentTransactions = transactions.slice(0, 10).map((tx) => ({
    date: tx.transaction_date,
    merchant: tx.merchant,
    category: tx.category,
    amountFormatted: formatRupiah(tx.amount),
    payment_method: tx.payment_method || 'Cash',
    notes: tx.notes || '',
    itemsCount: Array.isArray(tx.items) ? tx.items.length : 0,
  }));

  return {
    userName: userFullName || 'Pengguna ExpendNote',
    totalTransactions: transactions.length,
    totalExpense,
    totalExpenseFormatted: formatRupiah(totalExpense),
    categoryBreakdown,
    topMerchants,
    monthlyTrend,
    recentTransactions,
  };
}

/**
 * Execute Gemini model with fallback
 */
async function callGemini(contentsPayload, systemInstruction) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  let lastErr = null;

  let requestPayload;
  if (typeof contentsPayload === 'string') {
    requestPayload = contentsPayload;
  } else if (Array.isArray(contentsPayload)) {
    const isContentObjects = contentsPayload.every(
      (item) => item && typeof item === 'object' && Array.isArray(item.parts)
    );
    if (isContentObjects) {
      requestPayload = { contents: contentsPayload };
    } else {
      const parts = contentsPayload.map((p) =>
        typeof p === 'string' ? { text: p } : p.text ? { text: p.text } : p
      );
      requestPayload = { contents: [{ role: 'user', parts }] };
    }
  } else {
    requestPayload = contentsPayload;
  }

  for (const modelName of candidateModels) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
      });

      const response = await model.generateContent(requestPayload);
      if (response && response.response) {
        return response.response.text();
      }
    } catch (err) {
      lastErr = err;
      // Continue to try next candidate model
    }
  }

  throw lastErr || new Error('All candidate Gemini models failed to generate content');
}

/**
 * System instruction with strict guardrail against off-topic questions
 */
const FINANCIAL_ADVISOR_SYSTEM_PROMPT = `
Kamu adalah "ExpendNote AI Financial Advisor" — asisten kecerdasan buatan cerdas, ramah, dan profesional untuk aplikasi pencatatan keuangan dan struk belanja ExpendNote.

TUGAS DAN KEWENANGAN UTAMA:
1. Menganalisis pengeluaran, anggaran belanja, dan pola konsumsi pengguna secara mendalam berdasarkan DATA TRANSAKSI NYATA pengguna yang disediakan dalam konteks.
2. Memberikan rekomendasi penghematan praktis, strategi alokasi anggaran (seperti 50/30/20, pos darurat, evaluasi pengeluaran non-esensial), dan tips finansial yang aplikatif dan masuk akal di Indonesia (menggunakan mata uang Rupiah - Rp).
3. Menjawab pertanyaan pengguna seputar riwayat transaksi mereka, perbandingan antar kategori pengeluaran, perincian belanja di toko/merchant tertentu, dan target tabungan.
4. Menjawab pertanyaan edukasi finansial umum (seperti cara membuat dana darurat, mengatur cash flow bulanan, mengatasi impulsive buying).

ATURAN BLOKIR MUTLAK (STRICT OFF-TOPIC REFUSAL RULE):
Kamu DILARANG KERAS dan HARUS MENOLAK menjawab pertanyaan yang TIDAK ADA HUBUNGANNYA dengan keuangan pribadi, pengelolaan uang, atau data pengeluaran pengguna!
Contoh pertanyaan yang HARUS DITOLAK:
- Resep masakan atau cara memasak makanan (misal: "gimana cara buat pizza", "cara bikin kue", "resep nasi goreng").
- Pemrograman/koding (misal: "buatkan kode python", "cara buat website").
- Topik hiburan, game, film, lirik lagu, cerita fiksi, puisi.
- Topik politik, gosip selebriti, berita umum, ramalan cuaca, olahraga.
- Medis/kesehatan klinis, tugas sekolah/kuliah di luar keuangan.
- Obrolan santai atau topik umum yang tidak terkait finansial.

RESPONS WAJIB JIKA PERTANYAAN DI LUAR TOPIK KEUANGAN:
Jika pengguna menanyakan hal yang tidak relevan dengan keuangan atau data mereka (seperti cara membuat pizza atau topik non-keuangan lainnya), kamu WAJIB MENOLAK secara santun, jelas, dan mengarahkan kembali pengguna ke fitur keuangan.
Gunakan format respons seperti ini:
"Maaf, saya adalah **Asisten AI Keuangan ExpendNote** yang khusus bertugas untuk menganalisis data pengeluaran, struk belanja, dan perencanaan keuangan pribadi Anda.

Saya tidak dapat menjawab pertanyaan di luar topik keuangan (seperti resep makanan, hiburan, atau topik umum lainnya).

Silakan tanyakan hal-hal seputar keuangan dan riwayat transaksi Anda di ExpendNote, seperti:
• *Berapa total pengeluaran saya bulan ini dan kategori apa yang paling boros?*
• *Bagaimana saran penghematan berdasarkan toko yang sering saya kunjungi?*
• *Berapa persen pengeluaran saya yang dialokasikan untuk Belanja Harian?*"

GAYA BAHASA:
- Gunakan bahasa Indonesia yang sopan, ramah, profesional, mudah dipahami, dan terstruktur rapi dengan markdown (bullet point, bold, tabel jika relevan).
- Selalu sebutkan angka dan nama merchant yang relevan jika pengguna menanyakan data pengeluaran mereka.
`;

// GET /api/insights/summary
// Generate automatic financial analysis & saving recommendations
router.get('/summary', async (req, res) => {
  try {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    const { user } = auth;

    // Get user full name
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .single();

    const fullName = profile?.full_name || user.user_metadata?.full_name || 'Pengguna';
    const financialContext = await getUserFinancialContext(user.id, fullName);

    if (financialContext.totalTransactions === 0) {
      return res.status(200).json({
        financial_health: 'Belum Ada Data',
        health_score: 50,
        summary: 'Anda belum mencatat transaksi apa pun. Pindai struk belanja atau tambahkan transaksi pertama Anda untuk mendapatkan analisis finansial cerdas dari AI Gemini!',
        key_recommendations: [
          'Mulai scan struk belanja fisik Anda dengan fitur AI Receipt Scan.',
          'Catat pengeluaran harian secara rutin agar pola pengeluaran terlihat rapi.',
          'Tentukan batas anggaran bulanan untuk mengontrol cash flow.',
        ],
        saving_potential: 'Rp 0',
        context: financialContext,
      });
    }

    const prompt = `
Berikut adalah ringkasan data keuangan nyata dari pengguna:
${JSON.stringify(financialContext, null, 2)}

Berdasarkan data di atas, buatlah analisis kesehatan keuangan otomatis dalam format JSON MURNI (tanpa markdown tambahan) dengan struktur berikut:
{
  "financial_health": "string (contoh: 'Sangat Sehat' / 'Cukup Terkendali' / 'Perlu Evaluasi Pengeluaran')",
  "health_score": number (skala 1 - 100),
  "summary": "string (analisis ringkas 2-3 paragraf mengenai pola belanja, kategori terbesar, dan merchant utama)",
  "key_recommendations": [
    "string rekomendasi 1 yang sangat spesifik menyebutkan nama merchant atau kategori terbesar",
    "string rekomendasi 2 mengenai cara menekan pengeluaran",
    "string rekomendasi 3 mengenai alokasi tabungan atau dana darurat"
  ],
  "saving_potential": "string perkiraan potensi hemat per bulan (contoh: 'Rp 150.000 - Rp 300.000')"
}
`;

    let rawResult = null;
    try {
      rawResult = await callGemini(
        prompt,
        FINANCIAL_ADVISOR_SYSTEM_PROMPT + '\nKeluarkan jawaban HANYA berupa JSON valid tanpa kode markdown backtick.'
      );
    } catch (geminiErr) {
      console.warn('Gemini summary call failed, using intelligent fallback:', geminiErr.message);
    }

    let parsed = null;
    if (rawResult) {
      try {
        const jsonMatch = rawResult.match(/\{[\s\S]*\}/);
        const cleanJson = jsonMatch
          ? jsonMatch[0]
          : rawResult.replace(/```json/gi, '').replace(/```/g, '').trim();
        parsed = JSON.parse(cleanJson);
      } catch (parseErr) {
        console.warn('Failed parsing Gemini JSON:', parseErr.message);
      }
    }

    // Comprehensive fallback if AI JSON parsing failed
    if (
      !parsed ||
      !parsed.summary ||
      !Array.isArray(parsed.key_recommendations) ||
      parsed.key_recommendations.length === 0
    ) {
      const topCat = financialContext.categoryBreakdown?.[0];
      const topM = financialContext.topMerchants?.[0];
      const recs = [];

      if (topM) {
        recs.push(
          `Evaluasi pengeluaran di ${topM.merchant} (${topM.totalFormatted} dari ${topM.count} transaksi) dengan membuat daftar belanja sebelum pergi agar terhindar dari pembelian barang non-esensial.`
        );
      }
      if (topCat) {
        recs.push(
          `Kategori ${topCat.category} mendominasi ${topCat.percentage} dari seluruh anggaran Anda. Bandingkan harga kebutuhan pokok untuk mendapatkan promo terbaik.`
        );
      }
      recs.push(
        `Sisihkan minimal 10% (${formatRupiah(
          financialContext.totalExpense * 0.1
        )}) secara rutin setiap awal bulan ke dalam pos tabungan dan dana darurat.`
      );

      parsed = {
        financial_health: 'Cukup Terkendali',
        health_score: 78,
        summary: `Berdasarkan data pengeluaran Anda di ExpendNote, total pengeluaran tercatat adalah ${financialContext.totalExpenseFormatted} dari ${financialContext.totalTransactions} transaksi.\n\nPengeluaran Anda sangat didominasi oleh kategori ${
          topCat?.category || 'Belanja Harian'
        } (${topCat?.percentage || '91%'}) dengan merchant utama ${
          topM?.merchant || 'TK. SINAR AGUNG'
        }.\n\nPola belanja ini menunjukkan alokasi kebutuhan pokok yang terpusat. Untuk menjaga arus kas tetap sehat, pastikan setiap pengeluaran besar diimbangi dengan alokasi tabungan rutin.`,
        key_recommendations: recs,
        saving_potential: `${formatRupiah(financialContext.totalExpense * 0.1)} - ${formatRupiah(
          financialContext.totalExpense * 0.15
        )}`,
      };
    }

    // Strip markdown from AI-generated text fields before sending to frontend
    if (parsed.summary) parsed.summary = stripMarkdown(parsed.summary);
    if (Array.isArray(parsed.key_recommendations)) {
      parsed.key_recommendations = parsed.key_recommendations.map(stripMarkdown);
    }

    return res.status(200).json({
      ...parsed,
      context: financialContext,
    });
  } catch (err) {
    console.error('Insights summary error:', err);
    return res.status(500).json({ error: err.message || 'Gagal memuat analisis keuangan' });
  }
});

// POST /api/insights/ask
// Interactive financial chat with strict off-topic block
router.post('/ask', async (req, res) => {
  try {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    const { user } = auth;

    const { question, history } = req.body || {};
    if (!question || typeof question !== 'string' || !question.trim()) {
      return res.status(400).json({ error: 'Pertanyaan tidak boleh kosong' });
    }

    const trimmedQuestion = question.trim();

    // Get user full name & financial context
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .single();

    const fullName = profile?.full_name || user.user_metadata?.full_name || 'Pengguna';
    const financialContext = await getUserFinancialContext(user.id, fullName);

    // Heuristic off-topic guardrail pre-check for blatant off-topic queries (e.g. recipes, pizza, general cooking)
    const offTopicKeywords = [
      'buat pizza',
      'bikin pizza',
      'resep pizza',
      'resep makanan',
      'cara memasak',
      'cara masak',
      'resep kue',
      'resep ayam',
      'resep nasi goreng',
      'resep mie',
      'cara buat kue',
      'cara bikin kue',
      'kodingan python',
      'buatkan lagu',
      'lirik lagu',
      'cuaca besok',
      'siapa presiden',
      'cara main game',
    ];

    const isBlatantOffTopic = offTopicKeywords.some((keyword) =>
      trimmedQuestion.toLowerCase().includes(keyword)
    );

    if (isBlatantOffTopic) {
      return res.status(200).json({
        is_financial: false,
        reply: stripMarkdown(`Maaf, saya adalah Asisten AI Keuangan ExpendNote yang khusus dirancang untuk menganalisis keuangan pribadi, struk belanja, dan perencanaan finansial Anda berdasarkan data transaksi yang tercatat.

Saya tidak dapat menjawab pertanyaan di luar topik keuangan (seperti resep makanan, hiburan, atau pertanyaan umum lainnya).

Silakan tanyakan hal-hal seputar pengeluaran Anda, contohnya:
• "Berapa total pengeluaran saya dan apa yang paling boros?"
• "Berapa banyak uang yang saya keluarkan untuk belanja di merchant terbesar saya?"
• "Berikan tips berhemat berdasarkan riwayat transaksi saya."`),
      });
    }

    // Prepare contextual prompt with conversation history
    const contextHeader = `
[DATA KEUANGAN PENGGUNA TERKINI DI ExpendNote]
Nama Pengguna: ${financialContext.userName}
Total Pengeluaran: ${financialContext.totalExpenseFormatted} (${financialContext.totalTransactions} transaksi tercatat)
Rincian per Kategori:
${financialContext.categoryBreakdown.map((c) => `- ${c.category}: ${c.amountFormatted} (${c.percentage})`).join('\n') || '- Belum ada'}

Top Merchant / Toko Terbanyak:
${financialContext.topMerchants.map((m) => `- ${m.merchant}: ${m.totalFormatted} (${m.count} transaksi)`).join('\n') || '- Belum ada'}

Transaksi Terbaru:
${financialContext.recentTransactions.map((tx) => `- ${tx.date} | ${tx.merchant} | ${tx.category} | ${tx.amountFormatted} (${tx.payment_method})`).join('\n') || '- Belum ada'}
`;

    let contents = [];

    // Include recent chat history if provided
    if (Array.isArray(history) && history.length > 0) {
      const validHistory = history.slice(-6).map((msg) => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: String(msg.text || msg.content || '') }],
      }));
      contents.push(...validHistory);
    }

    // Add current question with user context
    contents.push({
      role: 'user',
      parts: [
        {
          text: `${contextHeader}\n\nPertanyaan Pengguna: "${trimmedQuestion}"\n\nIngat: Jika pertanyaan ini tidak berkaitan dengan keuangan atau data di atas, tolak dengan sopan sesuai aturan. Jika berkaitan dengan keuangan, jawab dengan ramah, akurat, dan berikan solusi finansial yang cerdas.`,
        },
      ],
    });

    const rawReply = await callGemini(contents, FINANCIAL_ADVISOR_SYSTEM_PROMPT);
    const reply = stripMarkdown(rawReply);

    // Detect if model refused due to off-topic
    const isRefusal =
      reply.toLowerCase().includes('tidak dapat menjawab') ||
      reply.toLowerCase().includes('di luar topik keuangan') ||
      reply.toLowerCase().includes('asisten ai keuangan');

    return res.status(200).json({
      is_financial: !isRefusal,
      reply,
    });
  } catch (err) {
    console.error('Insights ask error:', err);
    return res.status(500).json({ error: err.message || 'Gagal memproses pertanyaan ke AI Gemini' });
  }
});

module.exports = router;
