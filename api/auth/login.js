import bcrypt from 'bcryptjs';
import { applyCors } from '../../lib/cors.js';
import { connectToDatabase } from '../../lib/db.js';
import { signToken } from '../../lib/auth.js';
import User from '../../lib/models/User.js';

// POST /api/auth/login
// Body: { email, password }
export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ error: 'Email dan password wajib diisi' });
    }

    await connectToDatabase();

    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(401).json({ error: 'Email atau password salah' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Email atau password salah' });
    }

    const token = signToken(user);

    return res.status(200).json({
      success: true,
      message: 'Login berhasil',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        createdAt: user.createdAt,
      },
      token,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Terjadi kesalahan server: ' + err.message });
  }
}
