import bcrypt from 'bcryptjs';
import { applyCors } from '../../lib/cors.js';
import { requireUser } from '../../lib/auth.js';
import { connectToDatabase } from '../../lib/db.js';
import User from '../../lib/models/User.js';

// PUT /api/user/password -> Ganti password
// Body: { current_password, new_password }
export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  const auth = await requireUser(req, res);
  if (!auth) return;
  const { user } = auth;

  if (req.method !== 'PUT' && req.method !== 'POST') {
    res.setHeader('Allow', 'PUT, POST, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { current_password, new_password } = req.body || {};

    if (!current_password || !new_password) {
      return res.status(400).json({ error: 'Password saat ini dan password baru wajib diisi' });
    }

    if (new_password.length < 6) {
      return res.status(400).json({ error: 'Password baru minimal 6 karakter' });
    }

    await connectToDatabase();

    // Ambil user lengkap dengan field password
    const userWithPassword = await User.findById(user._id);
    if (!userWithPassword) {
      return res.status(404).json({ error: 'User tidak ditemukan' });
    }

    const isMatch = await bcrypt.compare(current_password, userWithPassword.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Password saat ini tidak sesuai' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(new_password, salt);

    userWithPassword.password = hashedPassword;
    await userWithPassword.save();

    return res.status(200).json({
      success: true,
      message: 'Password berhasil diperbarui',
    });
  } catch (err) {
    return res.status(500).json({ error: 'Gagal mengubah password: ' + err.message });
  }
}
