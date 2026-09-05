# Expense Tracker – Backend

Backend untuk aplikasi pencatatan keuangan pribadi (AI Receipt Scanner, Dashboard Analitik, Riwayat Transaksi, Manajemen Profil Pengguna, Ekspor Laporan CSV).

Dibangun dengan **Node.js (Vercel Serverless Functions)**, **MongoDB Atlas (Mongoose)**, dan **Google Gemini 1.5 Flash Vision**.

---

## 1. Struktur Proyek

```text
expense-tracker-backend/
├── api/
│   ├── health.js                     # GET  - cek status server
│   ├── auth/
│   │   ├── register.js               # POST - daftar akun baru (name, email, password)
│   │   └── login.js                  # POST - login akun & dapatkan JWT token
│   ├── user/
│   │   ├── profile.js                # GET  - lihat profil user | PUT - edit nama
│   │   ├── password.js               # PUT  - ganti password (validasi password lama)
│   │   └── avatar.js                 # POST - upload & simpan foto profil (Base64)
│   ├── transactions/
│   │   ├── index.js                  # GET  - list transaksi (filter + pagination) | POST - create
│   │   └── [id].js                   # GET  - detail | PUT/PATCH - update | DELETE - hapus
│   ├── receipts/
│   │   ├── scan.js                   # POST - OCR AI Gemini vision (auto-fill)
│   │   └── upload.js                 # POST - format/proses foto struk
│   ├── dashboard/
│   │   ├── summary.js                # GET  - metric cards (bulan ini vs bulan lalu)
│   │   ├── top-merchants.js          # GET  - leaderboard merchant pengeluaran terbanyak
│   │   ├── breakdown.js              # GET  - pie/donut chart per kategori
│   │   └── trend.js                  # GET  - tren pengeluaran harian sepanjang bulan
│   └── export/
│       └── csv.js                    # GET  - unduh laporan transaksi CSV
├── lib/
│   ├── db.js                         # koneksi MongoDB dengan connection caching
│   ├── auth.js                       # JWT sign & verify middleware (requireUser)
│   ├── cors.js                       # CORS headers helper
│   ├── csv.js                        # CSV converter helper
│   ├── ocr.js                        # Google Gemini 1.5 Flash OCR client
│   ├── categorize.js                 # fallback rule-based categorizer
│   └── models/
│       ├── User.js                   # Mongoose User Schema (name, email, password, avatar)
│       └── Transaction.js            # Mongoose Transaction Schema
├── expense_tracker.postman_collection.json # File koleksi Postman siap import
├── package.json
├── vercel.json
└── .env.example
```

---

## 2. Environment Variables

Salin `.env.example` ke `.env` lokal dan set di Vercel (**Project Settings > Environment Variables**):

| Variable | Keterangan | Contoh |
|---|---|---|
| `MONGODB_URI` | Connection string MongoDB Atlas | `mongodb+srv://user:pass@cluster.mongodb.net/expense_tracker?retryWrites=true&w=majority` |
| `JWT_SECRET` | Kunci rahasia untuk tanda tangan token JWT | `bebas-string-acak-panjang-apa-saja` |
| `GEMINI_API_KEY` | API Key Google Gemini untuk AI Receipt Scanner | Buat gratis di [aistudio.google.com](https://aistudio.google.com) |
| `CORS_ORIGIN` | Domain frontend yang diizinkan | `*` (development) atau `https://app.kamu.vercel.app` |

---

## 3. Autentikasi

Backend ini menggunakan **Native JWT (JSON Web Token)**:
1. Panggil `POST /api/auth/register` atau `POST /api/auth/login`.
2. Anda akan menerima `token`.
3. Sertakan token tersebut di setiap request endpoint yang membutuhkan autentikasi:
   ```text
   Authorization: Bearer <token>
   ```

---

## 4. Referensi API

### A. Autentikasi (Public)
| Method | Endpoint | Body | Keterangan |
|---|---|---|---|
| POST | `/api/auth/register` | `{ name, email, password }` | Daftar user baru |
| POST | `/api/auth/login` | `{ email, password }` | Login & dapatkan token JWT |

### B. Profil Pengguna (Wajib Token)
| Method | Endpoint | Body | Keterangan |
|---|---|---|---|
| GET | `/api/user/profile` | - | Ambil profil user saat ini |
| PUT | `/api/user/profile` | `{ name }` | Edit nama profil |
| PUT | `/api/user/password` | `{ current_password, new_password }` | Ganti password akun |
| POST | `/api/user/avatar` | `{ image_base64 }` | Upload & simpan foto profil |

### C. Transaksi (Wajib Token)
| Method | Endpoint | Body / Query | Keterangan |
|---|---|---|---|
| GET | `/api/transactions` | Query: `from, to, category, payment_method, q, page, page_size` | List riwayat transaksi |
| POST | `/api/transactions` | Body: `merchant, amount, category?, transaction_date?, payment_method?, notes?, items?, receipt_image?` | Tambah transaksi baru |
| GET | `/api/transactions/:id` | - | Detail satu transaksi |
| PATCH | `/api/transactions/:id` | Body: field apa saja yang ingin diubah | Update transaksi |
| DELETE | `/api/transactions/:id` | - | Hapus transaksi |

### D. AI Receipt Scanner (Wajib Token)
| Method | Endpoint | Body | Keterangan |
|---|---|---|---|
| POST | `/api/receipts/scan` | `{ image_base64, media_type? }` | Ekstrak data struk dengan Gemini AI |
| POST | `/api/receipts/upload` | `{ image_base64, media_type? }` | Format foto struk untuk transaksi |

### E. Dashboard & Ekspor (Wajib Token)
| Method | Endpoint | Query | Keterangan |
|---|---|---|---|
| GET | `/api/dashboard/summary` | - | Total bulan ini vs lalu, avg daily, % change |
| GET | `/api/dashboard/top-merchants` | `from, to, limit` | Leaderboard merchant pengeluaran terbesar |
| GET | `/api/dashboard/breakdown` | `from, to` | Persentase pengeluaran per kategori |
| GET | `/api/dashboard/trend` | `year, month` | Tren pengeluaran harian sepanjang bulan |
| GET | `/api/export/csv` | `preset=this_month\|last_month\|this_year\|custom` | Unduh file laporan CSV |

### F. Status Server (Public)
| Method | Endpoint | Keterangan |
|---|---|---|
| GET | `/api/health` | Cek status server aktif |
