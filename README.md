# Expense Notes — Backend (Node.js + Supabase + Vercel)

Backend API untuk aplikasi pencatat keuangan berbasis struk (sesuai spesifikasi
modul: AI Receipt Scanner, Dashboard & Analitik, Arsip Struk, Riwayat
Transaksi, Ekspor Laporan, Autentikasi & RLS) — ditambah fitur **edit profil
(nama/email/password/foto profil)** yang permanen lintas perangkat.

Dibangun sebagai **Vercel Serverless Functions** (tiap file di `api/` otomatis
jadi satu endpoint) + **Supabase** (Postgres, Auth, Storage).

---

## 1. Kenapa profil & foto tidak akan hilang

Semua data (profil, foto, transaksi) disimpan di **Supabase**, bukan di
browser/device pengguna:

- Tabel `profiles` memakai `id` yang sama dengan `auth.users.id` — id ini
  permanen milik akun, bukan milik device.
- Foto profil disimpan di **Supabase Storage** (bucket `avatars`), lalu hanya
  URL-nya yang disimpan di kolom `profiles.avatar_url`.
- Login dari HP baru, browser baru, atau device baru dengan **akun yang sama**
  akan selalu mengambil baris `profiles` yang sama → nama & foto tetap ada.
- Login dengan **akun Google yang berbeda** = user id Supabase yang berbeda →
  ini memang akun terpisah (secara desain, sama seperti aplikasi lain). Jika
  pengguna login dengan email/password lalu login Google dengan **email yang
  sama**, Supabase Auth secara default akan menautkan (link) ke user id yang
  sama, sehingga profil tetap nyambung.

---

## 2. Setup Supabase

1. Buat project baru di https://supabase.com.
2. Buka **SQL Editor**, jalankan seluruh isi file `sql/schema.sql`. Ini akan
   membuat tabel `profiles` & `transactions`, RLS policies, trigger
   auto-create-profile, dan policy untuk Storage.
3. Buka **Storage**, buat 2 bucket:
   - `avatars` → set **Public**
   - `receipts` → biarkan **Private**
4. Buka **Authentication > Providers**, aktifkan **Email** dan **Google**
   (isi Client ID/Secret dari Google Cloud Console untuk Google OAuth).
5. Ambil kredensial di **Project Settings > API**:
   - `Project URL` → `SUPABASE_URL`
   - `anon public` key → `SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (rahasia, jangan taruh di frontend)

---

## 3. Environment Variables

Salin `.env.example` → isi dengan kredensial asli. Saat deploy ke Vercel,
masukkan variabel yang sama di **Project Settings > Environment Variables**:

| Variable | Keterangan |
|---|---|
| `SUPABASE_URL` | URL project Supabase |
| `SUPABASE_ANON_KEY` | Anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (server only) |
| `ANTHROPIC_API_KEY` | API key untuk fitur OCR AI (di `/api/receipts/scan`) |
| `ANTHROPIC_MODEL` | Default `claude-sonnet-4-6` |
| `AVATAR_BUCKET` | Default `avatars` |
| `RECEIPT_BUCKET` | Default `receipts` |

---

## 4. Deploy ke Vercel

```bash
npm install -g vercel
cd expense-tracker-backend
vercel login
vercel        # deploy preview
vercel --prod # deploy production
```

Atau hubungkan repo GitHub project ini ke Vercel dashboard (Import Project),
lalu isi Environment Variables di atas sebelum deploy pertama.

---

## 5. Daftar Endpoint

Semua endpoint (kecuali `auth/register` & `auth/login`) butuh header:
`Authorization: Bearer <access_token>` (didapat dari response login/register).

### Auth
| Method | Path | Keterangan |
|---|---|---|
| POST | `/api/auth/register` | Daftar akun email/password |
| POST | `/api/auth/login` | Login email/password |
| POST | `/api/auth/refresh` | Tukar refresh_token → access_token baru |
| POST | `/api/auth/logout` | Logout (revoke session) |

> Login Google dilakukan langsung dari frontend via
> `supabase.auth.signInWithOAuth({ provider: 'google' })` — tidak perlu
> endpoint backend terpisah.

### Profil (fitur edit profil yang diminta)
| Method | Path | Keterangan |
|---|---|---|
| GET | `/api/profile` | Ambil profil (nama, email, foto) |
| PUT | `/api/profile` | Update nama dan/atau email |
| PUT | `/api/profile/password` | Ganti password (perlu current_password) |
| POST | `/api/profile/avatar` | Upload/ganti foto profil (multipart, field `avatar`) |

### Struk / OCR
| Method | Path | Keterangan |
|---|---|---|
| POST | `/api/receipts/scan` | Kirim foto (base64) → AI baca & isi form otomatis (preview, belum tersimpan) |
| POST | `/api/receipts/upload` | Upload foto struk final ke storage (multipart, field `receipt`) |

### Transaksi
| Method | Path | Keterangan |
|---|---|---|
| GET | `/api/transactions` | List + filter (`start_date`, `end_date`, `category`, `payment_method`, `search`, `page`, `limit`) |
| POST | `/api/transactions` | Buat transaksi baru |
| GET | `/api/transactions/:id` | Detail satu transaksi |
| PUT | `/api/transactions/:id` | Edit transaksi |
| DELETE | `/api/transactions/:id` | Hapus transaksi (ikut hapus foto struk) |

### Dashboard
| Method | Path | Keterangan |
|---|---|---|
| GET | `/api/dashboard/summary` | Total bulan ini, rata-rata harian, % vs bulan lalu, top merchant, breakdown kategori, tren harian |

### Ekspor
| Method | Path | Keterangan |
|---|---|---|
| GET | `/api/export/csv?period=this_month\|last_month\|this_year\|custom&start=&end=` | Download CSV transaksi |

---

## 6. Alur upload foto profil / struk dari frontend

```js
const form = new FormData();
form.append('avatar', fileFromInput); // File object dari <input type="file">

await fetch('https://<domain-vercel-kamu>/api/profile/avatar', {
  method: 'POST',
  headers: { Authorization: `Bearer ${accessToken}` },
  body: form, // JANGAN set Content-Type manual, biarkan browser yang set boundary
});
```

## 7. Catatan keamanan

- Semua tabel memakai **Row Level Security** — bahkan jika `anon key` bocor,
  orang lain tetap tidak bisa membaca/mengubah data user lain karena setiap
  query dijalankan dengan token JWT milik user yang login (`auth.uid()`).
- `service_role` key **tidak dipakai** di endpoint data harian — hanya
  disiapkan (`lib/supabaseAdmin.js`) untuk kebutuhan admin di masa depan.
- Bucket `receipts` bersifat private; foto struk hanya bisa diakses lewat
  **signed URL** yang berlaku 10 menit.
