const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const supabaseAdmin = require('../lib/supabaseAdmin');

// GET /api/dashboard/summary
router.get('/summary', async (req, res) => {
  try {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    const { user } = auth;

    // Fetch transactions for the user using supabaseAdmin
    const { data: allRows, error } = await supabaseAdmin
      .from('transactions')
      .select('id, merchant, amount, category, payment_method, transaction_date, created_at')
      .eq('user_id', user.id)
      .order('transaction_date', { ascending: false });

    if (error) return res.status(400).json({ error: error.message });

    const rows = allRows || [];
    const sum = (arr) => arr.reduce((acc, r) => acc + Number(r.amount || 0), 0);
    const totalAllTime = sum(rows);

    const now = new Date();
    const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthStr = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}`;

    const prevMonthRows = rows.filter((r) => r.transaction_date && r.transaction_date.startsWith(lastMonthStr));

    const totalThisMonth = totalAllTime;
    const totalLastMonth = sum(prevMonthRows);
    const percentChange = totalLastMonth === 0 ? null : ((totalThisMonth - totalLastMonth) / totalLastMonth) * 100;

    // Standard 30-day daily average (or run-rate)
    const avgDaily = Math.round(totalAllTime / 30);

    // Top merchants from all transactions
    const merchantMap = {};
    const merchantCountMap = {};
    for (const r of rows) {
      if (!r.merchant) continue;
      merchantMap[r.merchant] = (merchantMap[r.merchant] || 0) + Number(r.amount || 0);
      merchantCountMap[r.merchant] = (merchantCountMap[r.merchant] || 0) + 1;
    }
    const topMerchants = Object.entries(merchantMap)
      .map(([merchant, total]) => ({
        merchant,
        total_amount: total,
        total: total,
        transaction_count: merchantCountMap[merchant] || 1,
      }))
      .sort((a, b) => b.total_amount - a.total_amount)
      .slice(0, 5);

    // Category breakdown from all transactions
    const categoryMap = {};
    for (const r of rows) {
      const cat = r.category || 'Lainnya';
      categoryMap[cat] = (categoryMap[cat] || 0) + Number(r.amount || 0);
    }
    const totalCategoryAmount = Object.values(categoryMap).reduce((a, b) => a + b, 0) || 1;
    const categoryBreakdown = Object.entries(categoryMap)
      .map(([category, total]) => ({
        category,
        total_amount: total,
        total: total,
        percentage: Math.round((total / totalCategoryAmount) * 100),
      }))
      .sort((a, b) => b.total_amount - a.total_amount);

    // Daily trend: group by transaction_date across all recorded transactions
    const dailyMap = {};
    for (const r of rows) {
      if (!r.transaction_date) continue;
      dailyMap[r.transaction_date] = (dailyMap[r.transaction_date] || 0) + Number(r.amount || 0);
    }
    const dailyTrend = Object.entries(dailyMap)
      .map(([date, total]) => ({
        date,
        total_amount: total,
        total,
      }))
      .sort((a, b) => (a.date < b.date ? -1 : 1));

    return res.status(200).json({
      total_this_month: totalThisMonth,
      total_last_month: totalLastMonth,
      percent_change_vs_last_month: percentChange,
      average_daily_this_month: avgDaily,
      total_transactions: rows.length,
      focal_month: currentMonthStr,
      top_merchants: topMerchants,
      category_breakdown: categoryBreakdown,
      daily_trend: dailyTrend,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;

