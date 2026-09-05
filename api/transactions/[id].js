import { applyCors } from '../../lib/cors.js';
import { requireUser } from '../../lib/auth.js';
import { connectToDatabase } from '../../lib/db.js';
import Transaction from '../../lib/models/Transaction.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  const auth = await requireUser(req, res);
  if (!auth) return;
  const { user } = auth;
  const { id } = req.query;

  await connectToDatabase();

  if (req.method === 'GET') return handleGet(res, user, id);
  if (req.method === 'PUT' || req.method === 'PATCH') return handleUpdate(req, res, user, id);
  if (req.method === 'DELETE') return handleDelete(res, user, id);

  res.setHeader('Allow', 'GET, PUT, PATCH, DELETE, OPTIONS');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleGet(res, user, id) {
  try {
    const transaction = await Transaction.findOne({ _id: id, user_id: user._id }).lean();
    if (!transaction) {
      return res.status(404).json({ error: 'Transaksi tidak ditemukan' });
    }

    return res.status(200).json({
      data: {
        ...transaction,
        id: transaction._id,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: 'Gagal mengambil transaksi: ' + err.message });
  }
}

async function handleUpdate(req, res, user, id) {
  try {
    const body = req.body || {};
    const allowed = [
      'merchant',
      'amount',
      'category',
      'transaction_date',
      'payment_method',
      'notes',
      'items',
      'receipt_image',
    ];

    const patch = {};
    for (const key of allowed) {
      if (key in body) patch[key] = body[key];
    }
    if ('receipt_path' in body && !('receipt_image' in patch)) {
      patch.receipt_image = body.receipt_path;
    }

    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ error: 'Tidak ada field valid untuk diupdate' });
    }

    const updated = await Transaction.findOneAndUpdate(
      { _id: id, user_id: user._id },
      { $set: patch },
      { new: true }
    ).lean();

    if (!updated) {
      return res.status(404).json({ error: 'Transaksi tidak ditemukan' });
    }

    return res.status(200).json({
      data: {
        ...updated,
        id: updated._id,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: 'Gagal mengupdate transaksi: ' + err.message });
  }
}

async function handleDelete(res, user, id) {
  try {
    const deleted = await Transaction.findOneAndDelete({ _id: id, user_id: user._id });
    if (!deleted) {
      return res.status(404).json({ error: 'Transaksi tidak ditemukan' });
    }

    return res.status(200).json({ success: true, message: 'Transaksi berhasil dihapus' });
  } catch (err) {
    return res.status(500).json({ error: 'Gagal menghapus transaksi: ' + err.message });
  }
}
