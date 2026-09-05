import mongoose from 'mongoose';

const TransactionSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    merchant: {
      type: String,
      required: [true, 'Nama merchant wajib diisi'],
      trim: true,
    },
    amount: {
      type: Number,
      required: [true, 'Nominal amount wajib diisi'],
    },
    category: {
      type: String,
      default: 'Lainnya',
      trim: true,
      index: true,
    },
    transaction_date: {
      type: String, // Format YYYY-MM-DD
      default: () => new Date().toISOString().slice(0, 10),
      index: true,
    },
    payment_method: {
      type: String,
      default: null,
    },
    notes: {
      type: String,
      default: null,
    },
    items: {
      type: [String],
      default: [],
    },
    receipt_image: {
      type: String,
      default: null, // Base64 gambar struk
    },
  },
  {
    timestamps: true,
  }
);

TransactionSchema.index({ user_id: 1, transaction_date: -1 });
TransactionSchema.index({ user_id: 1, merchant: 1 });

export default mongoose.models.Transaction || mongoose.model('Transaction', TransactionSchema);
