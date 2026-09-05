import { applyCors } from '../../lib/cors.js';
import { requireUser } from '../../lib/auth.js';
import { connectToDatabase } from '../../lib/db.js';
import Transaction from '../../lib/models/Transaction.js';

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

    await connectToDatabase();

    const filter = { user_id: user._id };
    if (from || to) {
      filter.transaction_date = {};
      if (from) filter.transaction_date.$gte = from;
      if (to) filter.transaction_date.$lte = to;
    }

    const rows = await Transaction.find(filter).select('category amount').lean();

    const grouped = {};
    let total = 0;
    for (const row of rows) {
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
