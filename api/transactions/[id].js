import { applyCors } from '../../lib/cors.js';
import { requireUser } from '../../lib/auth.js';
import { getSupabaseAdmin } from '../../lib/supabase.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  const ctx = await requireUser(req, res);
  if (!ctx) return;
  const { supabase } = ctx;
  const { id } = req.query;

  if (req.method === 'GET') return handleGet(res, supabase, id);
  if (req.method === 'PUT' || req.method === 'PATCH') return handleUpdate(req, res, supabase, id);
  if (req.method === 'DELETE') return handleDelete(res, supabase, id);

  res.setHeader('Allow', 'GET, PUT, PATCH, DELETE, OPTIONS');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleGet(res, supabase, id) {
  const { data, error } = await supabase.from('transactions').select('*').eq('id', id).single();
  if (error) return res.status(404).json({ error: 'Transaksi tidak ditemukan' });
  return res.status(200).json({ data });
}

// PUT/PATCH /api/transactions/:id - body boleh berisi salah satu/semua field berikut
async function handleUpdate(req, res, supabase, id) {
  try {
    const body = req.body || {};
    const allowed = ['merchant', 'amount', 'category', 'transaction_date', 'payment_method', 'notes', 'items', 'receipt_path'];
    const patch = {};
    for (const key of allowed) if (key in body) patch[key] = body[key];

    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ error: 'Tidak ada field valid untuk diupdate' });
    }

    const { data, error } = await supabase
      .from('transactions')
      .update(patch)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return res.status(200).json({ data });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

// DELETE /api/transactions/:id - juga menghapus foto struk terkait di Storage
async function handleDelete(res, supabase, id) {
  try {
    const { data: existing, error: fetchErr } = await supabase
      .from('transactions')
      .select('receipt_path')
      .eq('id', id)
      .single();
    if (fetchErr) throw fetchErr;

    const { error } = await supabase.from('transactions').delete().eq('id', id);
    if (error) throw error;

    if (existing?.receipt_path) {
      const admin = getSupabaseAdmin();
      await admin.storage.from('receipts').remove([existing.receipt_path]);
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
