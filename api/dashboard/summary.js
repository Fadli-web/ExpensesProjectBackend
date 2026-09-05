import { applyCors } from '../../lib/cors.js';
import { requireUser } from '../../lib/auth.js';
import { supabaseAdmin } from '../../lib/db.js';

function toISO(d) {
  return d.toISOString().slice(0, 10);
}

function monthRange(date) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return [toISO(start), toISO(end)];
}

// GET /api/dashboard/summary
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
    const [thisStart, thisEnd] = monthRange(now);
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const [lastStart, lastEnd] = monthRange(lastMonthDate);

    const [thisResult, lastResult] = await Promise.all([
      supabaseAdmin
        .from('transactions')
        .select('amount')
        .eq('user_id', user.id)
        .gte('transaction_date', thisStart)
        .lte('transaction_date', thisEnd),
      supabaseAdmin
        .from('transactions')
        .select('amount')
        .eq('user_id', user.id)
        .gte('transaction_date', lastStart)
        .lte('transaction_date', lastEnd),
    ]);

    const totalThisMonth = (thisResult.data || []).reduce((s, r) => s + Number(r.amount), 0);
    const totalLastMonth = (lastResult.data || []).reduce((s, r) => s + Number(r.amount), 0);
    const daysElapsed = now.getDate();
    const avgDaily = daysElapsed > 0 ? totalThisMonth / daysElapsed : 0;
    const pctChange =
      totalLastMonth === 0 ? null : ((totalThisMonth - totalLastMonth) / totalLastMonth) * 100;

    return res.status(200).json({
      data: {
        total_this_month: totalThisMonth,
        total_last_month: totalLastMonth,
        avg_daily_expense: Math.round(avgDaily * 100) / 100,
        pct_change_vs_last_month: pctChange === null ? null : Math.round(pctChange * 100) / 100,
        period: { start: thisStart, end: thisEnd },
      },
    });
  } catch (err) {
    return res.status(500).json({ error: 'Gagal memuat summary dashboard: ' + err.message });
  }
}
