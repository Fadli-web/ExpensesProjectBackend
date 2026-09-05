# Expense Tracker – Backend

Backend untuk aplikasi pencatatan keuangan pribadi (AI Receipt Scanner, Dashboard Analitik,
Galeri Struk, Riwayat Transaksi, Ekspor Laporan). Dibangun dengan **Node.js (Vercel Serverless
Functions)** dan **Supabase** (Auth, Postgres, Storage).

## 1. Struktur Proyek

```
expense-tracker-backend/
├── api/
│   ├── health.js                     # GET  - cek status server
│   ├── transactions/
│   │   ├── index.js                  # GET (list+filter+pagination), POST (create)
│   │   └── [id].js                   # GET, PUT/PATCH, DELETE satu transaksi
│   ├── receipts/
│   │   ├── scan.js                   # POST - OCR AI, auto-fill form (tidak menyimpan)
│   │   ├── upload.js                 # POST - upload foto struk ke Storage privat
│   │   └── signed-url.js             # GET  - refresh signed URL untuk lightbox galeri
│   ├── dashboard/
│   │   ├── summary.js                # GET  - metric cards
│   │   ├── top-merchants.js          # GET  - leaderboard merchant
│   │   ├── breakdown.js              # GET  - data pie/donut chart per kategori
│   │   └── trend.js                  # GET  - data bar/area chart harian
│   └── export/
│       └── csv.js                    # GET  - unduh laporan CSV/Excel
├── lib/                              # helper bersama (supabase client, auth, cors, dst)
├── sql/schema.sql                    # skema tabel + RLS + storage policy
├── package.json
├── vercel.json
└── .env.example
```

## 2. Setup Supabase

1. Buat project baru di [supabase.com](https://supabase.com).
2. Buka **SQL Editor**, tempel isi `sql/schema.sql`, lalu jalankan (RUN).
   Ini akan membuat:
   - Tabel `transactions` + index
   - Row Level Security (setiap user hanya bisa akses datanya sendiri)
   - Bucket Storage privat `receipts` + policy per-user
3. Aktifkan provider login di **Authentication > Providers**:
   - Email/Password (aktif secara default)
   - Google OAuth (isi Client ID & Secret dari Google Cloud Console)
4. Ambil kredensial di **Project Settings > API**:
   - `Project URL` → `SUPABASE_URL`
   - `anon public` key → `SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (⚠️ rahasia, jangan pernah dikirim ke frontend)

## 3. Setup AI Receipt Scanner (Google Gemini 1.5 Flash)

Fitur scan struk (`/api/receipts/scan`) memakai Google Gemini 1.5 Flash vision untuk membaca gambar struk.
Buat API key gratis di [aistudio.google.com](https://aistudio.google.com) → isi ke `GEMINI_API_KEY`.

> Model default: `gemini-1.5-flash` via `@google/generative-ai`.

## 4. Environment Variables

Salin `.env.example` menjadi acuan, lalu set di Vercel (**Project Settings > Environment Variables**):

| Variable | Keterangan |
|---|---|
| `SUPABASE_URL` | URL project Supabase |
| `SUPABASE_ANON_KEY` | Public anon key (dipakai untuk request atas nama user login) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (dipakai internal untuk hapus file storage) |
| `GEMINI_API_KEY` | API key Google Gemini untuk fitur AI Receipt Scanner |
| `CORS_ORIGIN` | Domain frontend yang diizinkan mengakses API (mis. `https://app-kamu.vercel.app`) |
| `KEEP_ALIVE_SECRET` | String acak untuk melindungi endpoint `/api/keep-alive` (lihat bagian 9) |

## 5. Deploy ke Vercel

**Opsi A – via Vercel CLI**
```bash
npm i -g vercel
cd expense-tracker-backend
vercel login
vercel        # deploy preview
vercel --prod # deploy production
```
Saat proses `vercel`/`vercel link`, isi environment variables di atas ketika diminta,
atau tambahkan lewat dashboard Vercel setelah project terhubung.

**Opsi B – via GitHub**
1. Push folder ini ke repo GitHub.
2. Di [vercel.com/new](https://vercel.com/new), import repo tersebut.
3. Framework preset: pilih **Other** (Vercel otomatis mendeteksi folder `/api` sebagai serverless functions).
4. Isi Environment Variables di step konfigurasi, lalu **Deploy**.

Setelah deploy, base URL API akan berbentuk: `https://nama-project.vercel.app/api/...`

## 6. Alur Autentikasi dari Frontend

Backend ini **tidak** memiliki endpoint login sendiri — login/register dilakukan langsung dari
frontend memakai Supabase JS Client (`supabase.auth.signInWithPassword`,
`supabase.auth.signInWithOAuth({ provider: 'google' })`, dst).

Setelah login, ambil access token dan sertakan di setiap request ke backend ini:

```js
const { data: { session } } = await supabase.auth.getSession();

fetch('https://nama-project.vercel.app/api/transactions', {
  headers: {
    Authorization: `Bearer ${session.access_token}`,
  },
});
```

Backend akan memverifikasi token tersebut ke Supabase Auth dan menjalankan semua query
di bawah Row Level Security milik user itu — jadi user A tidak akan pernah bisa membaca/mengubah
data milik user B, sekalipun ada bug di kode.

## 7. Referensi API

Semua endpoint (kecuali `/api/health`) wajib header:
```
Authorization: Bearer <supabase_access_token>
```

### Transaksi
| Method | Endpoint | Body / Query |
|---|---|---|
| GET | `/api/transactions` | query: `from, to, category, payment_method, q, page, page_size` |
| POST | `/api/transactions` | body: `merchant, amount, category?, transaction_date?, payment_method?, notes?, items?, receipt_path?` |
| GET | `/api/transactions/:id` | - |
| PUT/PATCH | `/api/transactions/:id` | body: field apa saja yang mau diubah |
| DELETE | `/api/transactions/:id` | otomatis hapus foto struk terkait |

### Receipt Scanner & Storage
| Method | Endpoint | Body / Query |
|---|---|---|
| POST | `/api/receipts/scan` | body: `image_base64, media_type?` → return hasil OCR (belum tersimpan) |
| POST | `/api/receipts/upload` | body: `image_base64, media_type?` → simpan ke Storage, return `path` + `signed_url` |
| GET | `/api/receipts/signed-url` | query: `path` → refresh signed URL (berlaku 5 menit) |

Alur normal fitur "AI Receipt Scanner": user foto struk di frontend → kompres gambar di
browser (client-side, di luar backend ini) → `POST /api/receipts/scan` untuk auto-fill form →
user cek/edit form → `POST /api/receipts/upload` untuk simpan fotonya → `POST /api/transactions`
dengan `receipt_path` hasil upload tadi.

### Dashboard
| Method | Endpoint | Query |
|---|---|---|
| GET | `/api/dashboard/summary` | - (selalu bulan berjalan vs bulan lalu) |
| GET | `/api/dashboard/top-merchants` | `from, to, limit` |
| GET | `/api/dashboard/breakdown` | `from, to` |
| GET | `/api/dashboard/trend` | `year, month` |

### Ekspor
| Method | Endpoint | Query |
|---|---|---|
| GET | `/api/export/csv` | `preset=this_month\|last_month\|this_year\|custom` + `from, to` bila custom |

### Internal (Keep-Alive)
| Method | Endpoint | Header | Keterangan |
|---|---|---|---|
| GET | `/api/keep-alive` | `x-keep-alive-secret: <KEEP_ALIVE_SECRET>` | Dipanggil cron GitHub Actions, bukan oleh user login. Lihat bagian 8. |

## 8. Mencegah Supabase Free Tier Auto-Pause (Keep-Alive Cron)

Supabase free tier akan **mem-pause project** (termasuk database) jika tidak ada aktivitas
sama sekali selama ~7 hari. Untuk mencegah ini, backend sudah dilengkapi endpoint ringan
`GET /api/keep-alive` yang dipanggil otomatis lewat **GitHub Actions** setiap 3 hari sekali.

**Cara aktifkan:**

1. Generate secret acak, misalnya lewat terminal:
   ```bash
   openssl rand -hex 32
   ```
2. Set secret tersebut ke environment variable Vercel: `KEEP_ALIVE_SECRET`.
3. Push proyek ini ke GitHub (folder `.github/workflows/keep-alive.yml` sudah termasuk).
4. Di repo GitHub: **Settings > Secrets and variables > Actions > New repository secret**,
   tambahkan dua secret:
   | Secret | Isi |
   |---|---|
   | `BACKEND_URL` | URL deployment Vercel kamu, mis. `https://nama-project.vercel.app` (tanpa `/` di akhir) |
   | `KEEP_ALIVE_SECRET` | String acak yang sama persis dengan yang di-set di Vercel |
5. Selesai. Workflow akan berjalan otomatis sesuai jadwal cron (`0 3 */3 * *` = setiap 3 hari,
   jam 03:00 UTC). Bisa juga dites manual lewat tab **Actions > Keep Supabase Alive > Run workflow**.

Endpoint ini menjalankan query paling ringan yang mungkin (`select ... head:true limit 1`,
tidak mengambil data sungguhan) — cukup untuk dianggap Supabase sebagai aktivitas, tapi
tidak membebani database maupun kuota. Endpoint ini dilindungi secret key, jadi tidak bisa
dipanggil sembarang orang meski URL-nya publik.

> Catatan: kalau kamu upgrade ke plan Supabase berbayar (Pro ke atas), project tidak akan
> di-pause otomatis, jadi cron job ini bisa dinonaktifkan (hapus/nonaktifkan file workflow-nya).

## 9. Catatan Keamanan

- Semua endpoint transaksi & storage dijalankan lewat client Supabase yang di-scope ke JWT
  user (bukan service role), sehingga RLS selalu aktif.
- `SUPABASE_SERVICE_ROLE_KEY` hanya dipakai sekali di `[id].js` (DELETE) untuk membersihkan file
  storage lama — tidak pernah diekspos ke response.
- Batasi `CORS_ORIGIN` ke domain frontend asli sebelum go-live (jangan biarkan `*` di production).
