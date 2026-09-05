import { getSupabaseAdmin } from '../lib/supabase.js';

/**
 * Endpoint ini TIDAK memakai auth user biasa (dipanggil oleh cron job GitHub
 * Actions, bukan oleh user yang login). Sebagai gantinya dilindungi oleh
 * secret key sederhana lewat header "x-keep-alive-secret", supaya endpoint
 * ini tidak bisa dipakai sembarang orang untuk membebani database.
 *
 * Query yang dijalankan sengaja sangat ringan (head:true, limit 1) - tujuannya
 * hanya membuat Supabase mencatat aktivitas, bukan mengambil data sungguhan.
 *
 * GET /api/keep-alive
 * Header: x-keep-alive-secret: <KEEP_ALIVE_SECRET>
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const providedSecret = req.headers['x-keep-alive-secret'] || req.query.secret;
  const expectedSecret = process.env.KEEP_ALIVE_SECRET;

  if (!expectedSecret) {
    return res.status(500).json({ error: 'KEEP_ALIVE_SECRET belum di-set di environment variables' });
  }
  if (providedSecret !== expectedSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const supabase = getSupabaseAdmin();

    // Query super ringan: hanya minta count/head, tidak mengambil isi baris.
    // Ini cukup untuk dianggap Supabase sebagai "aktivitas database".
    const { error } = await supabase
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .limit(1);

    if (error) throw error;

    return res.status(200).json({
      status: 'ok',
      message: 'Supabase project ping berhasil',
      pinged_at: new Date().toISOString(),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
