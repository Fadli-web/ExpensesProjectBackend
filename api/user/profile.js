import { applyCors } from '../../lib/cors.js';
import { requireUser } from '../../lib/auth.js';
import { connectToDatabase } from '../../lib/db.js';
import User from '../../lib/models/User.js';

// GET /api/user/profile -> Ambil info profil user yang sedang login
// PUT /api/user/profile -> Update nama user
export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  const auth = await requireUser(req, res);
  if (!auth) return;
  const { user } = auth;

  if (req.method === 'GET') {
    return res.status(200).json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    });
  }

  if (req.method === 'PUT') {
    try {
      const { name } = req.body || {};
      if (!name || !name.trim()) {
        return res.status(400).json({ error: 'Nama tidak boleh kosong' });
      }

      await connectToDatabase();
      const updatedUser = await User.findByIdAndUpdate(
        user._id,
        { name: name.trim() },
        { new: true }
      ).select('-password');

      return res.status(200).json({
        success: true,
        message: 'Profil berhasil diperbarui',
        user: {
          id: updatedUser._id,
          name: updatedUser.name,
          email: updatedUser.email,
          avatar: updatedUser.avatar,
          updatedAt: updatedUser.updatedAt,
        },
      });
    } catch (err) {
      return res.status(500).json({ error: 'Gagal memperbarui profil: ' + err.message });
    }
  }

  res.setHeader('Allow', 'GET, PUT, OPTIONS');
  return res.status(405).json({ error: 'Method not allowed' });
}
