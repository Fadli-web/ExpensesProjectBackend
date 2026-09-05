const { requireAuth, applyCors } = require('../../middleware/auth');

const RECEIPT_BUCKET = process.env.RECEIPT_BUCKET || 'receipts';

// GET  /api/transactions
//   query params: start_date, end_date, category, payment_method, search,
//                 page (default 1), limit (default 20)
// POST /api/transactions
//   body: { merchant, amount, category, payment_method, transaction_date,
//           notes, items, receipt_path }
module.exports = async (req, res) => {
  if (applyCors(req, res)) return;

  const auth = await requireAuth(req, res);
  if (!auth) return;
  const { user, supabase } = auth;

  if (req.method === 'GET') {
    const {
      start_date, end_date, category, payment_method, search,
      page = '1', limit = '20',
    } = req.query;

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
    const from = (pageNum - 1) * limitNum;
    const to = from + limitNum - 1;

    let query = supabase
      .from('transactions')
      .select('*', { count: 'exact' })
      .eq('user_id', user.id)
      .order('transaction_date', { ascending: false })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (start_date) query = query.gte('transaction_date', start_date);
    if (end_date) query = query.lte('transaction_date', end_date);
    if (category) query = query.eq('category', category);
    if (payment_method) query = query.eq('payment_method', payment_method);
    if (search) query = query.ilike('merchant', `%${search}%`);

    const { data, error, count } = await query;
    if (error) return res.status(400).json({ error: error.message });

    // Turn stored private receipt paths into short-lived signed URLs
    const withUrls = await Promise.all(
      (data || []).map(async (t) => {
        if (!t.receipt_path) return { ...t, receipt_url: null };
        const { data: signed } = await supabase.storage
          .from(RECEIPT_BUCKET)
          .createSignedUrl(t.receipt_path, 60 * 10); // 10 minutes
        return { ...t, receipt_url: signed?.signedUrl || null };
      })
    );

    return res.status(200).json({
      data: withUrls,
      page: pageNum,
      limit: limitNum,
      total: count,
      total_pages: Math.ceil((count || 0) / limitNum),
    });
  }

  if (req.method === 'POST') {
    const {
      merchant, amount, category, payment_method,
      transaction_date, notes, items, receipt_path,
    } = req.body || {};

    if (!merchant || amount === undefined) {
      return res.status(400).json({ error: 'merchant and amount are required' });
    }

    const { data, error } = await supabase
      .from('transactions')
      .insert({
        user_id: user.id,
        merchant,
        amount,
        category: category || 'Lainnya',
        payment_method: payment_method || null,
        transaction_date: transaction_date || new Date().toISOString().slice(0, 10),
        notes: notes || null,
        items: items || null,
        receipt_path: receipt_path || null,
      })
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    return res.status(201).json({ data });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
