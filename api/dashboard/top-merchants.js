import { applyCors } from '../../lib/cors.js';
import { requireUser } from '../../lib/auth.js';

// GET /api/dashboard/top-merchants?from=&to=&limit=5
export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  const ctx = await requireUser(req, res);
  if (!ctx) return;
  const { supabase } = ctx;

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { from, to, limit = '5' } = req.query;
    let query = supabase.from('transactions').select('merchant, amount');
    if (from) query = query.gte('transaction_date', from);
    if (to) query = query.lte('transaction_date', to);

    const { data, error } = await query;
    if (error) throw error;

    const grouped = {};
    for (const row of data) {
      grouped[row.merchant] = (grouped[row.merchant] || 0) + Number(row.amount);
    }
    const leaderboard = Object.entries(grouped)
      .map(([merchant, total]) => ({ merchant, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, parseInt(limit, 10) || 5);

    return res.status(200).json({ data: leaderboard });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
