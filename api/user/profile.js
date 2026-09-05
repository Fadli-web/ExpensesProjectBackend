import { applyCors } from '../../lib/cors.js';
import { requireUser } from '../../lib/auth.js';
import { supabaseAdmin } from '../../lib/db.js';

// GET /api/user/profile  → Ambil data profil user yang sedang login
// PUT /api/user/profile  → Update nama user
export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  const auth = await requireUser(req, res);
  if (!auth) return;
  const { user } = auth;

  if (req.method === 'GET') {
    try {
      const { data: profile, error } = await supabaseAdmin
        .from('profiles')
        .select('id, name, avatar_url, created_at, updated_at')
        .eq('id', user.id)
        .single();

      if (error || !profile) {
        // Profil belum ada — buat otomatis
        const { data: newProfile, error: insertError } = await supabaseAdmin
          .from('profiles')
          .upsert({
            id: user.id,
            name: user.user_metadata?.name || user.email.split('@')[0],
            avatar_url: null,
          })
          .select()
          .single();

        if (insertError) {
          return res.status(500).json({ error: 'Gagal memuat profil: ' + insertError.message });
        }

        return res.status(200).json({ success: true, user: newProfile });
      }

      return res.status(200).json({
        success: true,
        user: {
          id: profile.id,
          name: profile.name,
          email: user.email,
          avatar_url: profile.avatar_url,
          created_at: profile.created_at,
          updated_at: profile.updated_at,
        },
      });
    } catch (err) {
      return res.status(500).json({ error: 'Gagal memuat profil: ' + err.message });
    }
  }

  if (req.method === 'PUT') {
    try {
      const { name } = req.body || {};
      if (!name || !name.trim()) {
        return res.status(400).json({ error: 'Nama tidak boleh kosong' });
      }

      const { data: updatedProfile, error } = await supabaseAdmin
        .from('profiles')
        .update({ name: name.trim() })
        .eq('id', user.id)
        .select()
        .single();

      if (error) {
        return res.status(500).json({ error: 'Gagal memperbarui profil: ' + error.message });
      }

      return res.status(200).json({
        success: true,
        message: 'Profil berhasil diperbarui',
        user: {
          id: updatedProfile.id,
          name: updatedProfile.name,
          email: user.email,
          avatar_url: updatedProfile.avatar_url,
          updated_at: updatedProfile.updated_at,
        },
      });
    } catch (err) {
      return res.status(500).json({ error: 'Gagal memperbarui profil: ' + err.message });
    }
  }

  res.setHeader('Allow', 'GET, PUT, OPTIONS');
  return res.status(405).json({ error: 'Method not allowed' });
}
