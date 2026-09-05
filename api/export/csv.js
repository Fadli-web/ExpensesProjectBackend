import { applyCors } from '../../lib/cors.js';
import { requireUser } from '../../lib/auth.js';
import { connectToDatabase } from '../../lib/db.js';
import Transaction from '../../lib/models/Transaction.js';
import { toCsv } from '../../lib/csv.js';

function toISO(d) {
  return d.toISOString().slice(0, 10);
}

function presetRange(preset) {
  const now = new Date();
  if (preset === 'this_month') {
    return [
      toISO(new Date(now.getFullYear(), now.getMonth(), 1)),
      toISO(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
    ];
  }
  if (preset === 'last_month') {
    return [
      toISO(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
      toISO(new Date(now.getFullYear(), now.getMonth(), 0)),
    ];
  }
  if (preset === 'this_year') {
    return [
      toISO(new Date(now.getFullYear(), 0, 1)),
      toISO(new Date(now.getFullYear(), 11, 31)),
    ];
  }
  return [null, null];
}

// GET /api/export/csv?preset=this_month|last_month|this_year|custom&from=&to=
export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  const auth = await requireUser(req, res);
  if (!auth) return;
  const { user } = auth;

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    let { from, to, preset } = req.query;
    if (preset && preset !== 'custom') {
      [from, to] = presetRange(preset);
    }

    await connectToDatabase();

    const filter = { user_id: user._id };
    if (from || to) {
      filter.transaction_date = {};
      if (from) filter.transaction_date.$gte = from;
      if (to) filter.transaction_date.$lte = to;
    }

    const data = await Transaction.find(filter)
      .select('transaction_date merchant category amount notes payment_method')
      .sort({ transaction_date: 1 })
      .lean();

    const rows = data.map((r) => ({
      Tanggal: r.transaction_date,
      'Nama Toko': r.merchant,
      Kategori: r.category,
      Nominal: r.amount,
      'Metode Bayar': r.payment_method || '',
      Catatan: r.notes || '',
    }));

    const csv = toCsv(rows);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="laporan-keuangan-${from || 'all'}_${to || 'all'}.csv"`
    );
    return res.status(200).send(csv);
  } catch (err) {
    return res.status(500).json({ error: 'Gagal mengekspor data: ' + err.message });
  }
}
