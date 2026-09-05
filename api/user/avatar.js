import { applyCors } from '../../lib/cors.js';
import { requireUser } from '../../lib/auth.js';
import { supabaseAdmin } from '../../lib/db.js';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '5mb',
    },
  },
};

// POST /api/user/avatar
// Body: { image_base64, media_type? }
// Upload foto profil ke Supabase Storage bucket "avatars"
export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  const auth = await requireUser(req, res);
  if (!auth) return;
  const { user } = auth;

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { image_base64, media_type = 'image/jpeg' } = req.body || {};

    if (!image_base64) {
      return res.status(400).json({ error: 'image_base64 wajib diisi' });
    }

    // Konversi Base64 ke Buffer
    let base64Data = image_base64;
    if (base64Data.includes(',')) {
      // Ambil hanya data setelah "data:image/jpeg;base64,"
      base64Data = base64Data.split(',')[1];
    }

    const buffer = Buffer.from(base64Data, 'base64');

    // Tentukan ekstensi file dari media type
    const ext = media_type.split('/')[1] || 'jpg';
    const filePath = `${user.id}/avatar.${ext}`;

    // Upload ke Supabase Storage bucket "avatars"
    const { error: uploadError } = await supabaseAdmin.storage
      .from('avatars')
      .upload(filePath, buffer, {
        contentType: media_type,
        upsert: true, // Timpa jika sudah ada
      });

    if (uploadError) {
      return res.status(500).json({ error: 'Gagal upload foto: ' + uploadError.message });
    }

    // Dapatkan URL publik
    const { data: urlData } = supabaseAdmin.storage
      .from('avatars')
      .getPublicUrl(filePath);

    const avatarUrl = urlData.publicUrl;

    // Simpan URL ke tabel profiles
    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({ avatar_url: avatarUrl })
      .eq('id', user.id);

    if (updateError) {
      return res.status(500).json({ error: 'Gagal menyimpan URL foto: ' + updateError.message });
    }

    return res.status(200).json({
      success: true,
      message: 'Foto profil berhasil disimpan',
      avatar_url: avatarUrl,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Gagal menyimpan foto profil: ' + err.message });
  }
}
