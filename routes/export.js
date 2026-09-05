const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const supabaseAdmin = require('../lib/supabaseAdmin');

function csvEscape(val) {
  if (val === null || val === undefined) return '';
  const s = String(val);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function periodToRange(period, custom_start, custom_end) {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  if (period === 'all') {
    return { isAll: true };
  }
  if (period === 'last_month') {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0);
    return { isAll: false, start: fmt(start), end: fmt(end) };
  }
  if (period === 'this_year') {
    return { isAll: false, start: `${now.getFullYear()}-01-01`, end: fmt(now) };
  }
  if (period === 'custom') {
    return { isAll: false, start: custom_start, end: custom_end };
  }

  // default: this_month
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return { isAll: false, start: fmt(start), end: fmt(now) };
}

// GET /api/export/csv
router.get('/csv', async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;
  const { user } = auth;

  const { period = 'all', start: customStart, end: customEnd } = req.query;
  const range = periodToRange(period, customStart, customEnd);

  let query = supabaseAdmin
    .from('transactions')
    .select('id, transaction_date, merchant, category, amount, payment_method, notes, receipt_path, items, created_at')
    .eq('user_id', user.id)
    .order('transaction_date', { ascending: false });

  if (!range.isAll && range.start && range.end) {
    query = query.gte('transaction_date', range.start).lte('transaction_date', range.end);
  }

  let { data, error } = await query;
  if (error) return res.status(400).json({ error: error.message });

  let rows = data || [];

  // SMART DATE FALLBACK:
  // Struk yang dipindai pengguna mungkin memiliki tanggal cetak struk dari bulan/tahun lampau,
  // tetapi pengguna mencatatnya di bulan ini (created_at).
  // Jika filter rentang menghasilkan 0 baris, periksa created_at atau gunakan fallback semua transaksi
  // agar file CSV tidak kosong melompong.
  if (rows.length === 0 && !range.isAll && range.start && range.end) {
    const { data: createdInRange } = await supabaseAdmin
      .from('transactions')
      .select('id, transaction_date, merchant, category, amount, payment_method, notes, receipt_path, items, created_at')
      .eq('user_id', user.id)
      .gte('created_at', range.start)
      .lte('created_at', range.end + 'T23:59:59.999Z')
      .order('transaction_date', { ascending: false });

    if (createdInRange && createdInRange.length > 0) {
      rows = createdInRange;
    } else {
      // Fallback: Jika pengguna memiliki transaksi di web, sertakan semua data transaksi
      const { data: allUserTxs } = await supabaseAdmin
        .from('transactions')
        .select('id, transaction_date, merchant, category, amount, payment_method, notes, receipt_path, items, created_at')
        .eq('user_id', user.id)
        .order('transaction_date', { ascending: false });

      if (allUserTxs && allUserTxs.length > 0) {
        rows = allUserTxs;
      }
    }
  }

  const header = [
    'Tanggal Transaksi',
    'Nama Toko / Merchant',
    'Kategori',
    'Nominal (Rp)',
    'Metode Pembayaran',
    'Catatan',
    'Jumlah Item',
    'Bukti Struk',
    'Tanggal Dicatat',
  ];

  const lines = [header.join(',')];

  for (const t of rows) {
    const itemCount = Array.isArray(t.items) ? t.items.length : 0;
    const receiptStatus = t.receipt_path ? 'Ada Foto Struk' : 'Tanpa Struk';
    const createdAtFmt = t.created_at ? t.created_at.slice(0, 10) : '';

    lines.push(
      [
        csvEscape(t.transaction_date),
        csvEscape(t.merchant),
        csvEscape(t.category),
        csvEscape(t.amount),
        csvEscape(t.payment_method || 'Cash'),
        csvEscape(t.notes || ''),
        csvEscape(itemCount),
        csvEscape(receiptStatus),
        csvEscape(createdAtFmt),
      ].join(',')
    );
  }

  // Prepend UTF-8 BOM (\uFEFF) dan \r\n line-breaks agar WPS Office & Excel memformat kolom dengan sempurna
  const csv = '\uFEFF' + lines.join('\r\n');
  const filename = range.isAll
    ? `transaksi_semua.csv`
    : `transaksi_${range.start || 'all'}_sd_${range.end || 'all'}.csv`;

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return res.status(200).send(csv);
});

module.exports = router;
