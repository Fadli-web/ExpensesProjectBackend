import { applyCors } from '../../lib/cors.js';
import { requireUser } from '../../lib/auth.js';
import { supabaseAdmin } from '../../lib/db.js';

// GET /api/dashboard/breakdown?from=&to=
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
    const { from, to } = req.query;

    let query = supabaseAdmin
      .from('transactions')
      .select('category, amount')
      .eq('user_id', user.id);

    if (from) query = query.gte('transaction_date', from);
    if (to) query = query.lte('transaction_date', to);

    const { data, error } = await query;

    if (error) {
      return res.status(500).json({ error: 'Gagal memuat kategori breakdown: ' + error.message });
    }

    const grouped = {};
    let total = 0;
    for (const row of data || []) {
      const cat = row.category || 'Lainnya';
      grouped[cat] = (grouped[cat] || 0) + Number(row.amount);
      total += Number(row.amount);
    }

    const breakdown = Object.entries(grouped)
      .map(([category, amount]) => ({
        category,
        amount,
        pct: total > 0 ? Math.round((amount / total) * 10000) / 100 : 0,
      }))
      .sort((a, b) => b.amount - a.amount);

    return res.status(200).json({ data: breakdown, total });
  } catch (err) {
    return res.status(500).json({ error: 'Gagal memuat kategori breakdown: ' + err.message });
  }
}
