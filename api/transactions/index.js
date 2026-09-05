import { applyCors } from '../../lib/cors.js';
import { requireUser } from '../../lib/auth.js';
import { supabaseAdmin } from '../../lib/db.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  const auth = await requireUser(req, res);
  if (!auth) return;
  const { user } = auth;

  if (req.method === 'GET') return handleList(req, res, user);
  if (req.method === 'POST') return handleCreate(req, res, user);

  res.setHeader('Allow', 'GET, POST, OPTIONS');
  return res.status(405).json({ error: 'Method not allowed' });
}

// GET /api/transactions?from=&to=&category=&payment_method=&q=&page=&page_size=
async function handleList(req, res, user) {
  try {
    const {
      from,
      to,
      category,
      payment_method,
      q,
      page = '1',
      page_size = '20',
    } = req.query;

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(page_size, 10) || 20, 1), 100);
    const from_idx = (pageNum - 1) * pageSize;
    const to_idx = from_idx + pageSize - 1;

    let query = supabaseAdmin
      .from('transactions')
      .select('*', { count: 'exact' })
      .eq('user_id', user.id)
      .order('transaction_date', { ascending: false })
      .order('created_at', { ascending: false })
      .range(from_idx, to_idx);

    if (from) query = query.gte('transaction_date', from);
    if (to) query = query.lte('transaction_date', to);
    if (category) query = query.eq('category', category);
    if (payment_method) query = query.eq('payment_method', payment_method);
    if (q) query = query.ilike('merchant', `%${q.trim()}%`);

    const { data, error, count } = await query;

    if (error) {
      return res.status(500).json({ error: 'Gagal mengambil data transaksi: ' + error.message });
    }

    return res.status(200).json({
      data: data || [],
      pagination: {
        page: pageNum,
        page_size: pageSize,
        total: count || 0,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: 'Gagal mengambil data transaksi: ' + err.message });
  }
}

// POST /api/transactions
// Body: { merchant, amount, category?, transaction_date?, payment_method?, notes?, items?, receipt_image? }
async function handleCreate(req, res, user) {
  try {
    const body = req.body || {};
    const {
      merchant,
      amount,
      category,
      transaction_date,
      payment_method,
      notes,
      items,
      receipt_image,
      receipt_path,
    } = body;

    if (!merchant || amount === undefined || amount === null) {
      return res.status(400).json({ error: 'merchant dan amount wajib diisi' });
    }

    const { data, error } = await supabaseAdmin
      .from('transactions')
      .insert({
        user_id: user.id,
        merchant: merchant.trim(),
        amount: Number(amount),
        category: category || 'Lainnya',
        transaction_date: transaction_date || new Date().toISOString().slice(0, 10),
        payment_method: payment_method || null,
        notes: notes || null,
        items: items || [],
        receipt_image: receipt_image || receipt_path || null,
      })
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: 'Gagal membuat transaksi: ' + error.message });
    }

    return res.status(201).json({ data });
  } catch (err) {
    return res.status(500).json({ error: 'Gagal membuat transaksi: ' + err.message });
  }
}
