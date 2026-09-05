import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Nama wajib diisi'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Email wajib diisi'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Format email tidak valid'],
    },
    password: {
      type: String,
      required: [true, 'Password wajib diisi'],
      minlength: [6, 'Password minimal 6 karakter'],
    },
    avatar: {
      type: String,
      default: null, // Berisi Base64 data URL atau URL foto profil
    },
  },
  {
    timestamps: true,
  }
);

// Hindari OverwriteModelError pada Vercel hot reload / re-invocations
export default mongoose.models.User || mongoose.model('User', UserSchema);
