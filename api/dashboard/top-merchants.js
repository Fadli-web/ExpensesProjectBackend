import { applyCors } from '../../lib/cors.js';
import { requireUser } from '../../lib/auth.js';
import { connectToDatabase } from '../../lib/db.js';
import Transaction from '../../lib/models/Transaction.js';

// GET /api/dashboard/top-merchants?from=&to=&limit=5
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
    const { from, to, limit = '5' } = req.query;

    await connectToDatabase();

    const filter = { user_id: user._id };
    if (from || to) {
      filter.transaction_date = {};
      if (from) filter.transaction_date.$gte = from;
      if (to) filter.transaction_date.$lte = to;
    }

    const rows = await Transaction.find(filter).select('merchant amount').lean();

    const grouped = {};
    for (const row of rows) {
      grouped[row.merchant] = (grouped[row.merchant] || 0) + Number(row.amount);
    }

    const leaderboard = Object.entries(grouped)
      .map(([merchant, total]) => ({ merchant, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, parseInt(limit, 10) || 5);

    return res.status(200).json({ data: leaderboard });
  } catch (err) {
    return res.status(500).json({ error: 'Gagal memuat top merchants: ' + err.message });
  }
}
