import { applyCors } from '../../lib/cors.js';
import { requireUser } from '../../lib/auth.js';
import { connectToDatabase } from '../../lib/db.js';
import Transaction from '../../lib/models/Transaction.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  const auth = await requireUser(req, res);
  if (!auth) return;
  const { user } = auth;

  await connectToDatabase();

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
    const skip = (pageNum - 1) * pageSize;

    const filter = { user_id: user._id };

    if (from || to) {
      filter.transaction_date = {};
      if (from) filter.transaction_date.$gte = from;
      if (to) filter.transaction_date.$lte = to;
    }

    if (category) filter.category = category;
    if (payment_method) filter.payment_method = payment_method;
    if (q) filter.merchant = { $regex: q.trim(), $options: 'i' };

    const [total, transactions] = await Promise.all([
      Transaction.countDocuments(filter),
      Transaction.find(filter)
        .sort({ transaction_date: -1, createdAt: -1 })
        .skip(skip)
        .limit(pageSize)
        .lean(),
    ]);

    const data = transactions.map((t) => ({
      ...t,
      id: t._id,
    }));

    return res.status(200).json({
      data,
      pagination: {
        page: pageNum,
        page_size: pageSize,
        total,
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

    const created = await Transaction.create({
      user_id: user._id,
      merchant: merchant.trim(),
      amount: Number(amount),
      category: category || 'Lainnya',
      transaction_date: transaction_date || new Date().toISOString().slice(0, 10),
      payment_method: payment_method || null,
      notes: notes || null,
      items: items || [],
      receipt_image: receipt_image || receipt_path || null,
    });

    const data = created.toObject();
    data.id = data._id;

    return res.status(201).json({ data });
  } catch (err) {
    return res.status(500).json({ error: 'Gagal membuat transaksi: ' + err.message });
  }
}
