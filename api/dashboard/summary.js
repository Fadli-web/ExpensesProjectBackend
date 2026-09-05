const { requireAuth, applyCors } = require('../../middleware/auth');

function ymd(d) { return d.toISOString().slice(0, 10); }
function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function startOfNextMonth(d) { return new Date(d.getFullYear(), d.getMonth() + 1, 1); }

// GET /api/dashboard/summary
// Returns everything the dashboard needs in one call:
//   - total this month / avg daily / % change vs last month
//   - top merchants
//   - category breakdown (for the donut chart)
//   - daily trend for the current month (for the bar/area chart)
module.exports = async (req, res) => {
  if (applyCors(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const auth = await requireAuth(req, res);
  if (!auth) return;
  const { user, supabase } = auth;

  const now = new Date();
  const thisMonthStart = startOfMonth(now);
  const nextMonthStart = startOfNextMonth(now);
  const lastMonthStart = startOfMonth(new Date(now.getFullYear(), now.getMonth() - 1, 1));

  // Pull this month + last month in one query, aggregate in JS.
  // (For very large datasets, move this aggregation into a Postgres RPC.)
  const { data: rows, error } = await supabase
    .from('transactions')
    .select('merchant, amount, category, transaction_date')
    .eq('user_id', user.id)
    .gte('transaction_date', ymd(lastMonthStart))
    .lt('transaction_date', ymd(nextMonthStart));

  if (error) return res.status(400).json({ error: error.message });

  const thisMonthRows = rows.filter((r) => r.transaction_date >= ymd(thisMonthStart));
  const lastMonthRows = rows.filter(
    (r) => r.transaction_date >= ymd(lastMonthStart) && r.transaction_date < ymd(thisMonthStart)
  );

  const sum = (arr) => arr.reduce((acc, r) => acc + Number(r.amount), 0);
  const totalThisMonth = sum(thisMonthRows);
  const totalLastMonth = sum(lastMonthRows);
  const percentChange = totalLastMonth === 0 ? null : ((totalThisMonth - totalLastMonth) / totalLastMonth) * 100;

  const daysSoFar = now.getDate();
  const avgDaily = daysSoFar > 0 ? totalThisMonth / daysSoFar : 0;

  // Top merchants
  const merchantMap = {};
  for (const r of thisMonthRows) {
    merchantMap[r.merchant] = (merchantMap[r.merchant] || 0) + Number(r.amount);
  }
  const topMerchants = Object.entries(merchantMap)
    .map(([merchant, total]) => ({ merchant, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  // Category breakdown
  const categoryMap = {};
  for (const r of thisMonthRows) {
    categoryMap[r.category] = (categoryMap[r.category] || 0) + Number(r.amount);
  }
  const categoryBreakdown = Object.entries(categoryMap)
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total);

  // Daily trend
  const dailyMap = {};
  for (const r of thisMonthRows) {
    dailyMap[r.transaction_date] = (dailyMap[r.transaction_date] || 0) + Number(r.amount);
  }
  const dailyTrend = Object.entries(dailyMap)
    .map(([date, total]) => ({ date, total }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  return res.status(200).json({
    total_this_month: totalThisMonth,
    total_last_month: totalLastMonth,
    percent_change_vs_last_month: percentChange,
    average_daily_this_month: avgDaily,
    top_merchants: topMerchants,
    category_breakdown: categoryBreakdown,
    daily_trend: dailyTrend,
  });
};
