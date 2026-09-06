const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const supabaseAdmin = require('../lib/supabaseAdmin');

const SEP = ';'; // Semicolon separator — standard for Indonesian locale (Excel/WPS)

// Wrap value in quotes and escape internal quotes
function q(val) {
  if (val === null || val === undefined) return '""';
  return `"${String(val).trim().replace(/"/g, '""')}"`;
}

// Format number as plain integer (no quotes) so Excel can sum/sort it
function num(val) {
  const n = Number(val);
  return isNaN(n) ? '0' : String(Math.round(n));
}

// Format date from YYYY-MM-DD to DD/MM/YYYY for human readability
function fmtDate(dateStr) {
  if (!dateStr) return '""';
  const d = String(dateStr).slice(0, 10);
  const parts = d.split('-');
  if (parts.length !== 3) return q(dateStr);
  return q(`${parts[2]}/${parts[1]}/${parts[0]}`);
}

// Format Rupiah with thousands separator: 415000 → "Rp 415.000"
function rupiah(val) {
  const n = Number(val);
  if (isNaN(n)) return q('Rp 0');
  return q('Rp ' + Math.round(n).toLocaleString('id-ID'));
}

// Shorten OCR notes to something clean and brief
function shortNote(notes) {
  if (!notes) return q('-');
  const confMatch = notes.match(/Confidence:\s*(\d+)%/);
  if (confMatch) return q(`Scan AI (${confMatch[1]}%)`);
  const s = String(notes).trim();
  return q(s.length > 40 ? s.slice(0, 40) + '...' : s);
}

function periodToRange(period, custom_start, custom_end) {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  if (period === 'all') return { isAll: true, label: 'Semua Data' };
  if (period === 'last_month') {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0);
    return { isAll: false, start: fmt(start), end: fmt(end), label: 'Bulan Lalu' };
  }
  if (period === 'this_year') {
    return { isAll: false, start: `${now.getFullYear()}-01-01`, end: fmt(now), label: `Tahun ${now.getFullYear()}` };
  }
  if (period === 'custom') {
    return { isAll: false, start: custom_start, end: custom_end, label: `${custom_start} s/d ${custom_end}` };
  }
  // default: this_month
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  return { isAll: false, start: fmt(start), end: fmt(now), label: `${months[now.getMonth()]} ${now.getFullYear()}` };
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

  // Smart fallback: if no rows found by transaction_date, try by created_at
  if (rows.length === 0 && !range.isAll && range.start && range.end) {
    const { data: byCreated } = await supabaseAdmin
      .from('transactions')
      .select('id, transaction_date, merchant, category, amount, payment_method, notes, receipt_path, items, created_at')
      .eq('user_id', user.id)
      .gte('created_at', range.start)
      .lte('created_at', range.end + 'T23:59:59.999Z')
      .order('transaction_date', { ascending: false });

    if (byCreated && byCreated.length > 0) {
      rows = byCreated;
    } else {
      // Last resort: all transactions
      const { data: allTxs } = await supabaseAdmin
        .from('transactions')
        .select('id, transaction_date, merchant, category, amount, payment_method, notes, receipt_path, items, created_at')
        .eq('user_id', user.id)
        .order('transaction_date', { ascending: false });
      if (allTxs && allTxs.length > 0) rows = allTxs;
    }
  }

  // ── Column headers ────────────────────────────────────────────────────────────
  const HEADERS = [
    q('No.'),
    q('Tanggal'),
    q('Nama Toko / Merchant'),
    q('Kategori'),
    q('Nominal'),
    q('Jumlah (Rp)'),
    q('Metode Bayar'),
    q('Catatan'),
    q('Struk'),
  ];

  const lines = [];

  // ── Report title block ────────────────────────────────────────────────────────
  const exportedAt = new Date().toLocaleString('id-ID', {
    day: '2-digit', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
  const EMPTY_ROW = Array(HEADERS.length).fill('').join(SEP);

  lines.push([q('LAPORAN TRANSAKSI EXPENDNOTE'), ...Array(HEADERS.length - 1).fill('')].join(SEP));
  lines.push([q(`Periode: ${range.label}`), ...Array(HEADERS.length - 1).fill('')].join(SEP));
  lines.push([q(`Diekspor pada: ${exportedAt}`), ...Array(HEADERS.length - 1).fill('')].join(SEP));
  lines.push([q(`Total Transaksi: ${rows.length} transaksi`), ...Array(HEADERS.length - 1).fill('')].join(SEP));
  lines.push(EMPTY_ROW); // blank separator row

  // ── Header row ────────────────────────────────────────────────────────────────
  lines.push(HEADERS.join(SEP));

  // ── Data rows ─────────────────────────────────────────────────────────────────
  let grandTotal = 0;
  const categoryMap = {};

  for (let i = 0; i < rows.length; i++) {
    const t = rows[i];
    const amount = Number(t.amount || 0);
    grandTotal += amount;

    const cat = t.category || 'Lainnya';
    categoryMap[cat] = (categoryMap[cat] || 0) + amount;

    const receiptMark = t.receipt_path ? '✓ Ada Struk' : '- Tanpa Struk';

    lines.push([
      num(i + 1),
      fmtDate(t.transaction_date),
      q(t.merchant || '-'),
      q(cat),
      rupiah(amount),   // Human-readable "Rp 415.000"
      num(amount),      // Raw number so Excel can sum/sort
      q(t.payment_method || 'Cash'),
      shortNote(t.notes),
      q(receiptMark),
    ].join(SEP));
  }

  // ── Grand total row ───────────────────────────────────────────────────────────
  lines.push(EMPTY_ROW);
  lines.push([
    q(''), q(''), q(''),
    q('TOTAL KESELURUHAN'),
    rupiah(grandTotal),
    num(grandTotal),
    q(''), q(''), q(''),
  ].join(SEP));

  // ── Category summary block ────────────────────────────────────────────────────
  lines.push(EMPTY_ROW);
  lines.push([q('RINGKASAN PER KATEGORI'), ...Array(HEADERS.length - 1).fill('')].join(SEP));
  lines.push([q('Kategori'), q('Nominal'), q('Jumlah (Rp)'), q('% dari Total'), ...Array(HEADERS.length - 4).fill('')].join(SEP));

  const sortedCats = Object.entries(categoryMap).sort((a, b) => b[1] - a[1]);
  for (const [cat, total] of sortedCats) {
    const pct = grandTotal > 0 ? ((total / grandTotal) * 100).toFixed(1) + '%' : '0%';
    lines.push([
      q(cat),
      rupiah(total),
      num(total),
      q(pct),
      ...Array(HEADERS.length - 4).fill(''),
    ].join(SEP));
  }

  // ── Assemble CSV with UTF-8 BOM ───────────────────────────────────────────────
  const csv = '\uFEFF' + lines.join('\r\n');

  // Dynamic filename based on period label
  const safePeriod = range.label
    .replace(/[^a-zA-Z0-9]/g, '-')
    .replace(/-+/g, '-')
    .toLowerCase();
  const filename = `expendnote-transaksi-${safePeriod}.csv`;

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return res.status(200).send(csv);
});

module.exports = router;
