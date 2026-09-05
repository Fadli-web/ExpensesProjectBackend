import { applyCors } from '../../lib/cors.js';
import { requireUser } from '../../lib/auth.js';
import { toCsv } from '../../lib/csv.js';

function toISO(d) { return d.toISOString().slice(0, 10); }

function presetRange(preset) {
  const now = new Date();
  if (preset === 'this_month') {
    return [toISO(new Date(now.getFullYear(), now.getMonth(), 1)), toISO(new Date(now.getFullYear(), now.getMonth() + 1, 0))];
  }
  if (preset === 'last_month') {
    return [toISO(new Date(now.getFullYear(), now.getMonth() - 1, 1)), toISO(new Date(now.getFullYear(), now.getMonth(), 0))];
  }
  if (preset === 'this_year') {
    return [toISO(new Date(now.getFullYear(), 0, 1)), toISO(new Date(now.getFullYear(), 11, 31))];
  }
  return [null, null];
}

// GET /api/export/csv?preset=this_month|last_month|this_year|custom&from=&to=
export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  const ctx = await requireUser(req, res);
  if (!ctx) return;
  const { supabase } = ctx;

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    let { from, to, preset } = req.query;
    if (preset && preset !== 'custom') {
      [from, to] = presetRange(preset);
    }

    let query = supabase
      .from('transactions')
      .select('transaction_date, merchant, category, amount, notes, receipt_path')
      .order('transaction_date', { ascending: true });
    if (from) query = query.gte('transaction_date', from);
    if (to) query = query.lte('transaction_date', to);

    const { data, error } = await query;
    if (error) throw error;

    const rows = data.map((r) => ({
      Tanggal: r.transaction_date,
      'Nama Toko': r.merchant,
      Kategori: r.category,
      Nominal: r.amount,
      Catatan: r.notes || '',
      'URL Struk': r.receipt_path || '',
    }));

    const csv = toCsv(rows);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="laporan-keuangan-${from || 'all'}_${to || 'all'}.csv"`);
    return res.status(200).send(csv);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
