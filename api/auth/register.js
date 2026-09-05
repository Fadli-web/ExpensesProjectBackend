import bcrypt from 'bcryptjs';
import { applyCors } from '../../lib/cors.js';
import { connectToDatabase } from '../../lib/db.js';
import { signToken } from '../../lib/auth.js';
import User from '../../lib/models/User.js';

// POST /api/auth/register
// Body: { name, email, password }
export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { name, email, password } = req.body || {};

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Nama, email, dan password wajib diisi' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password minimal 6 karakter' });
    }

    await connectToDatabase();

    const normalizedEmail = email.toLowerCase().trim();
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(400).json({ error: 'Email sudah terdaftar. Silakan login.' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password: hashedPassword,
    });

    const token = signToken(newUser);

    return res.status(201).json({
      success: true,
      message: 'Registrasi berhasil',
      user: {
        id: newUser._id,
        name: newUser.name,
        email: newUser.email,
        avatar: newUser.avatar,
        createdAt: newUser.createdAt,
      },
      token,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Terjadi kesalahan server: ' + err.message });
  }
}
