import { applyCors } from '../../lib/cors.js';
import { requireUser } from '../../lib/auth.js';
import { connectToDatabase } from '../../lib/db.js';
import Transaction from '../../lib/models/Transaction.js';

// GET /api/dashboard/trend?year=2026&month=9  (default: bulan berjalan)
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
    const now = new Date();
    const { year = String(now.getFullYear()), month = String(now.getMonth() + 1) } = req.query;
    const y = parseInt(year, 10);
    const m = parseInt(month, 10);

    const start = new Date(y, m - 1, 1);
    const end = new Date(y, m, 0);
    const startISO = start.toISOString().slice(0, 10);
    const endISO = end.toISOString().slice(0, 10);

    await connectToDatabase();

    const data = await Transaction.find({
      user_id: user._id,
      transaction_date: { $gte: startISO, $lte: endISO },
    }).select('transaction_date amount').lean();

    const daysInMonth = end.getDate();
    const monthPrefix = startISO.slice(0, 8); // "YYYY-MM-"
    const series = Array.from({ length: daysInMonth }, (_, i) => ({
      date: `${monthPrefix}${String(i + 1).padStart(2, '0')}`,
      total: 0,
    }));
    const indexByDate = Object.fromEntries(series.map((s, i) => [s.date, i]));

    for (const row of data) {
      const idx = indexByDate[row.transaction_date];
      if (idx !== undefined) series[idx].total += Number(row.amount);
    }

    return res.status(200).json({ data: series });
  } catch (err) {
    return res.status(500).json({ error: 'Gagal memuat tren transaksi: ' + err.message });
  }
}
