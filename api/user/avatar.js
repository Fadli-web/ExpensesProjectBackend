import { applyCors } from '../../lib/cors.js';
import { requireUser } from '../../lib/auth.js';
import { connectToDatabase } from '../../lib/db.js';
import User from '../../lib/models/User.js';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '5mb',
    },
  },
};

// POST /api/user/avatar -> Upload & Simpan Foto Profil
// Body: { image_base64 }
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
    const { image_base64 } = req.body || {};

    if (!image_base64) {
      return res.status(400).json({ error: 'image_base64 wajib diisi' });
    }

    // Pastikan format data URL rapi (bisa langsung dipakai di tag <img> frontend)
    let formattedAvatar = image_base64;
    if (!formattedAvatar.startsWith('data:image/')) {
      formattedAvatar = `data:image/jpeg;base64,${image_base64}`;
    }

    await connectToDatabase();
    const updatedUser = await User.findByIdAndUpdate(
      user._id,
      { avatar: formattedAvatar },
      { new: true }
    ).select('-password');

    return res.status(200).json({
      success: true,
      message: 'Foto profil berhasil disimpan',
      avatar: updatedUser.avatar,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Gagal menyimpan foto profil: ' + err.message });
  }
}
