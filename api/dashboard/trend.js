import { applyCors } from '../../lib/cors.js';
import { requireUser } from '../../lib/auth.js';
import { supabaseAdmin } from '../../lib/db.js';

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

    const { data, error } = await supabaseAdmin
      .from('transactions')
      .select('transaction_date, amount')
      .eq('user_id', user.id)
      .gte('transaction_date', startISO)
      .lte('transaction_date', endISO);

    if (error) {
      return res.status(500).json({ error: 'Gagal memuat tren transaksi: ' + error.message });
    }

    const daysInMonth = end.getDate();
    const monthPrefix = startISO.slice(0, 8); // "YYYY-MM-"
    const series = Array.from({ length: daysInMonth }, (_, i) => ({
      date: `${monthPrefix}${String(i + 1).padStart(2, '0')}`,
      total: 0,
    }));
    const indexByDate = Object.fromEntries(series.map((s, i) => [s.date, i]));

    for (const row of data || []) {
      const dateStr = typeof row.transaction_date === 'string'
        ? row.transaction_date.slice(0, 10)
        : new Date(row.transaction_date).toISOString().slice(0, 10);
      const idx = indexByDate[dateStr];
      if (idx !== undefined) series[idx].total += Number(row.amount);
    }

    return res.status(200).json({ data: series });
  } catch (err) {
    return res.status(500).json({ error: 'Gagal memuat tren transaksi: ' + err.message });
  }
}
