const { requireAuth, applyCors } = require('../../middleware/auth');

function csvEscape(val) {
  if (val === null || val === undefined) return '';
  const s = String(val);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function periodToRange(period, custom_start, custom_end) {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  if (period === 'last_month') {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0);
    return { start: fmt(start), end: fmt(end) };
  }
  if (period === 'this_year') {
    return { start: `${now.getFullYear()}-01-01`, end: fmt(now) };
  }
  if (period === 'custom') {
    return { start: custom_start, end: custom_end };
  }
  // default: this_month
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return { start: fmt(start), end: fmt(now) };
}

// GET /api/export/csv?period=this_month|last_month|this_year|custom&start=YYYY-MM-DD&end=YYYY-MM-DD
// Streams a CSV download of the user's transactions in the chosen period.
module.exports = async (req, res) => {
  if (applyCors(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const auth = await requireAuth(req, res);
  if (!auth) return;
  const { user, supabase } = auth;

  const { period = 'this_month', start: customStart, end: customEnd } = req.query;
  const { start, end } = periodToRange(period, customStart, customEnd);

  if (!start || !end) {
    return res.status(400).json({ error: 'start and end are required for period=custom' });
  }

  const { data, error } = await supabase
    .from('transactions')
    .select('transaction_date, merchant, category, amount, payment_method, notes, receipt_path')
    .eq('user_id', user.id)
    .gte('transaction_date', start)
    .lte('transaction_date', end)
    .order('transaction_date', { ascending: true });

  if (error) return res.status(400).json({ error: error.message });

  const header = ['Tanggal', 'Nama Toko', 'Kategori', 'Nominal', 'Metode Pembayaran', 'Catatan', 'Path Struk'];
  const lines = [header.join(',')];

  for (const t of data) {
    lines.push([
      csvEscape(t.transaction_date),
      csvEscape(t.merchant),
      csvEscape(t.category),
      csvEscape(t.amount),
      csvEscape(t.payment_method),
      csvEscape(t.notes),
      csvEscape(t.receipt_path),
    ].join(','));
  }

  const csv = lines.join('\n');
  const filename = `transaksi_${start}_sd_${end}.csv`;

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return res.status(200).send(csv);
};
