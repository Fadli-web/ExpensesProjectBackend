import jwt from 'jsonwebtoken';
import { connectToDatabase } from './db.js';
import User from './models/User.js';

const JWT_SECRET = process.env.JWT_SECRET || 'expense-tracker-secret-key-2026';

/**
 * Membuat token JWT untuk user
 */
export function signToken(user) {
  return jwt.sign(
    {
      id: user._id.toString(),
      email: user.email,
    },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}

/**
 * Middleware untuk memvalidasi token JWT dari header Authorization.
 * Mengembalikan { user, token } jika valid, atau null jika gagal (mengirim response 401).
 */
export async function requireUser(req, res) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

  if (!token) {
    res.status(401).json({ error: 'Header Authorization Bearer token wajib diisi' });
    return null;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    await connectToDatabase();

    const user = await User.findById(decoded.id).select('-password');
    if (!user) {
      res.status(401).json({ error: 'User tidak ditemukan atau sesi sudah tidak berlaku' });
      return null;
    }

    return { user, token };
  } catch (err) {
    res.status(401).json({ error: 'Token tidak valid atau sudah kedaluwarsa' });
    return null;
  }
}
