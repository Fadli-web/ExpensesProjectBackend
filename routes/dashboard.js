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
    const now = new Date();
    const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthStr = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}`;

    // Filter transactions in current calendar month
    let activeMonthRows = rows.filter((r) => r.transaction_date && r.transaction_date.startsWith(currentMonthStr));
    let prevMonthRows = rows.filter((r) => r.transaction_date && r.transaction_date.startsWith(lastMonthStr));

    // If current calendar month has no transactions, but user has transactions recorded (e.g. older scanned receipts):
    // Use the latest transaction's month as the focal active month so the dashboard reflects the user's data!
    let focalMonthLabel = currentMonthStr;
    if (activeMonthRows.length === 0 && rows.length > 0) {
      const latestTx = rows[0];
      if (latestTx?.transaction_date) {
        const latestMonthStr = latestTx.transaction_date.slice(0, 7);
        focalMonthLabel = latestMonthStr;
        const [yr, mo] = latestMonthStr.split('-').map(Number);
        const prevMoDate = new Date(yr, mo - 2, 1);
        const prevMoStr = `${prevMoDate.getFullYear()}-${String(prevMoDate.getMonth() + 1).padStart(2, '0')}`;

        activeMonthRows = rows.filter((r) => r.transaction_date && r.transaction_date.startsWith(latestMonthStr));
        prevMonthRows = rows.filter((r) => r.transaction_date && r.transaction_date.startsWith(prevMoStr));
      }
    }

    const targetRows = activeMonthRows.length > 0 ? activeMonthRows : rows;

    const sum = (arr) => arr.reduce((acc, r) => acc + Number(r.amount || 0), 0);
    const totalThisMonth = sum(targetRows);
    const totalLastMonth = sum(prevMonthRows);
    const percentChange = totalLastMonth === 0 ? null : ((totalThisMonth - totalLastMonth) / totalLastMonth) * 100;

    const daysCount = Math.max(new Set(targetRows.map((r) => r.transaction_date)).size, 1);
    const avgDaily = totalThisMonth / daysCount;

    // Top merchants (from targetRows or all rows)
    const merchantPool = targetRows.length >= 3 ? targetRows : rows;
    const merchantMap = {};
    const merchantCountMap = {};
    for (const r of merchantPool) {
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

    // Category breakdown
    const categoryPool = targetRows.length >= 3 ? targetRows : rows;
    const categoryMap = {};
    for (const r of categoryPool) {
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

    // Daily trend: group by transaction_date
    const dailyMap = {};
    for (const r of targetRows) {
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
      average_daily_this_month: Math.round(avgDaily),
      focal_month: focalMonthLabel,
      top_merchants: topMerchants,
      category_breakdown: categoryBreakdown,
      daily_trend: dailyTrend,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;

