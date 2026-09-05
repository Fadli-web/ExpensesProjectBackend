const { requireAuth, applyCors } = require('../../middleware/auth');

const RECEIPT_BUCKET = process.env.RECEIPT_BUCKET || 'receipts';

// GET /api/receipts/gallery
// Modul 3: Galeri Arsip Struk (Digital Receipt Vault)
// Returns transactions that have receipts with signed URLs for secure viewing
// query params: page (default 1), limit (default 20), category, search, start_date, end_date
module.exports = async (req, res) => {
  if (applyCors(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const auth = await requireAuth(req, res);
  if (!auth) return;
  const { user, supabase } = auth;

  const {
    page = '1',
    limit = '20',
    category,
    search,
    start_date,
    end_date,
  } = req.query;

  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
  const from = (pageNum - 1) * limitNum;
  const to = from + limitNum - 1;

  let query = supabase
    .from('transactions')
    .select('id, merchant, amount, category, payment_method, transaction_date, notes, receipt_path, created_at', { count: 'exact' })
    .eq('user_id', user.id)
    .not('receipt_path', 'is', null)
    .order('transaction_date', { ascending: false })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (category) query = query.eq('category', category);
  if (search) query = query.ilike('merchant', `%${search}%`);
  if (start_date) query = query.gte('transaction_date', start_date);
  if (end_date) query = query.lte('transaction_date', end_date);

  const { data, error, count } = await query;
  if (error) return res.status(400).json({ error: error.message });

  // Generate 1-hour signed URLs for each receipt image
  const receipts = await Promise.all(
    (data || []).map(async (item) => {
      let receipt_url = null;
      if (item.receipt_path) {
        const { data: signed } = await supabase.storage
          .from(RECEIPT_BUCKET)
          .createSignedUrl(item.receipt_path, 60 * 60); // 1 hour validity
        receipt_url = signed?.signedUrl || null;
      }
      return {
        ...item,
        receipt_url,
      };
    })
  );

  return res.status(200).json({
    data: receipts,
    page: pageNum,
    limit: limitNum,
    total: count,
    total_pages: Math.ceil((count || 0) / limitNum),
  });
};
