import { applyCors } from '../../lib/cors.js';
import { requireUser } from '../../lib/auth.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  const ctx = await requireUser(req, res);
  if (!ctx) return;
  const { supabase, user } = ctx;

  if (req.method === 'GET') return handleList(req, res, supabase);
  if (req.method === 'POST') return handleCreate(req, res, supabase, user);

  res.setHeader('Allow', 'GET, POST, OPTIONS');
  return res.status(405).json({ error: 'Method not allowed' });
}

// GET /api/transactions?from=&to=&category=&payment_method=&q=&page=&page_size=
async function handleList(req, res, supabase) {
  try {
    const {
      from, to, category, payment_method, q,
      page = '1', page_size = '20',
    } = req.query;

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(page_size, 10) || 20, 1), 100);
    const start = (pageNum - 1) * pageSize;
    const end = start + pageSize - 1;

    let query = supabase
      .from('transactions')
      .select('*', { count: 'exact' })
      .order('transaction_date', { ascending: false })
      .order('created_at', { ascending: false })
      .range(start, end);

    if (from) query = query.gte('transaction_date', from);
    if (to) query = query.lte('transaction_date', to);
    if (category) query = query.eq('category', category);
    if (payment_method) query = query.eq('payment_method', payment_method);
    if (q) query = query.ilike('merchant', `%${q}%`);

    const { data, error, count } = await query;
    if (error) throw error;

    return res.status(200).json({
      data,
      pagination: { page: pageNum, page_size: pageSize, total: count },
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

// POST /api/transactions
// body: { merchant, amount, category?, transaction_date?, payment_method?, notes?, items?, receipt_path? }
async function handleCreate(req, res, supabase, user) {
  try {
    const body = req.body || {};
    const {
      merchant, amount, category, transaction_date,
      payment_method, notes, items, receipt_path,
    } = body;

    if (!merchant || amount === undefined || amount === null) {
      return res.status(400).json({ error: 'merchant dan amount wajib diisi' });
    }

    const { data, error } = await supabase
      .from('transactions')
      .insert({
        user_id: user.id,
        merchant,
        amount,
        category: category || 'Lainnya',
        transaction_date: transaction_date || new Date().toISOString().slice(0, 10),
        payment_method: payment_method || null,
        notes: notes || null,
        items: items || [],
        receipt_path: receipt_path || null,
      })
      .select()
      .single();

    if (error) throw error;
    return res.status(201).json({ data });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
