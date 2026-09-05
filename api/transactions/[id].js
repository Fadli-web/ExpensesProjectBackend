const { requireAuth, applyCors } = require('../../middleware/auth');

const RECEIPT_BUCKET = process.env.RECEIPT_BUCKET || 'receipts';

// GET    /api/transactions/:id
// PUT    /api/transactions/:id   (edit amount/category/etc.)
// DELETE /api/transactions/:id   (also removes the linked receipt file)
module.exports = async (req, res) => {
  if (applyCors(req, res)) return;

  const auth = await requireAuth(req, res);
  if (!auth) return;
  const { user, supabase } = auth;
  const { id } = req.query;

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (error) return res.status(404).json({ error: 'Transaction not found' });

    let receipt_url = null;
    if (data.receipt_path) {
      const { data: signed } = await supabase.storage
        .from(RECEIPT_BUCKET)
        .createSignedUrl(data.receipt_path, 60 * 10);
      receipt_url = signed?.signedUrl || null;
    }

    return res.status(200).json({ data: { ...data, receipt_url } });
  }

  if (req.method === 'PUT') {
    const allowed = ['merchant', 'amount', 'category', 'payment_method', 'transaction_date', 'notes', 'items'];
    const updates = {};
    for (const key of allowed) {
      if (req.body?.[key] !== undefined) updates[key] = req.body[key];
    }
    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('transactions')
      .update(updates)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json({ data });
  }

  if (req.method === 'DELETE') {
    const { data: existing } = await supabase
      .from('transactions')
      .select('receipt_path')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    const { error } = await supabase
      .from('transactions')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) return res.status(400).json({ error: error.message });

    if (existing?.receipt_path) {
      await supabase.storage.from(RECEIPT_BUCKET).remove([existing.receipt_path]);
    }

    return res.status(200).json({ message: 'Transaction deleted.' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
