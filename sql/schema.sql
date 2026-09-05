-- ================================================================
-- EXPENSE TRACKER - Supabase SQL Schema
-- Jalankan di: Supabase Dashboard > SQL Editor > New Query
-- ================================================================

-- ----------------------------------------------------------------
-- TABEL: profiles
-- Menyimpan data profil user yang extend dari Supabase Auth
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id         UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name       TEXT        NOT NULL DEFAULT '',
  avatar_url TEXT        DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ----------------------------------------------------------------
-- TABEL: transactions
-- Menyimpan semua transaksi/pengeluaran user
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.transactions (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  merchant         TEXT        NOT NULL,
  amount           NUMERIC     NOT NULL,
  category         TEXT        NOT NULL DEFAULT 'Lainnya',
  transaction_date DATE        NOT NULL DEFAULT CURRENT_DATE,
  payment_method   TEXT        DEFAULT NULL,
  notes            TEXT        DEFAULT NULL,
  items            TEXT[]      DEFAULT '{}',
  receipt_image    TEXT        DEFAULT NULL,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Index untuk performa query filtering
CREATE INDEX IF NOT EXISTS idx_transactions_user_id        ON public.transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_user_date      ON public.transactions(user_id, transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_user_category  ON public.transactions(user_id, category);
CREATE INDEX IF NOT EXISTS idx_transactions_user_merchant  ON public.transactions(user_id, merchant);

-- ----------------------------------------------------------------
-- ROW LEVEL SECURITY (RLS)
-- User hanya bisa mengakses data milik mereka sendiri
-- ----------------------------------------------------------------
ALTER TABLE public.profiles     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- Policies untuk tabel profiles
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update" ON public.profiles;

CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "profiles_insert" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_update" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- Policies untuk tabel transactions
DROP POLICY IF EXISTS "transactions_select" ON public.transactions;
DROP POLICY IF EXISTS "transactions_insert" ON public.transactions;
DROP POLICY IF EXISTS "transactions_update" ON public.transactions;
DROP POLICY IF EXISTS "transactions_delete" ON public.transactions;

CREATE POLICY "transactions_select" ON public.transactions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "transactions_insert" ON public.transactions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "transactions_update" ON public.transactions
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "transactions_delete" ON public.transactions
  FOR DELETE USING (auth.uid() = user_id);

-- ----------------------------------------------------------------
-- SERVICE ROLE POLICIES (untuk backend menggunakan service_role key)
-- Dibutuhkan agar backend bisa insert profile saat register
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "profiles_service_insert" ON public.profiles;

CREATE POLICY "profiles_service_insert" ON public.profiles
  FOR ALL USING (true)
  WITH CHECK (true);

-- CATATAN: Policy di atas memungkinkan service_role bypass RLS.
-- Service role key HARUS dijaga rahasia dan hanya digunakan di backend.

-- ----------------------------------------------------------------
-- TRIGGER: Auto-update updated_at
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_profiles_updated_at ON public.profiles;
CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_transactions_updated_at ON public.transactions;
CREATE TRIGGER set_transactions_updated_at
  BEFORE UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ----------------------------------------------------------------
-- STORAGE: Bucket untuk avatar foto profil
-- Jalankan ini ATAU buat manual di Dashboard > Storage > New Bucket
-- Nama bucket: "avatars", set Public = true
-- ----------------------------------------------------------------
-- INSERT INTO storage.buckets (id, name, public)
-- VALUES ('avatars', 'avatars', true)
-- ON CONFLICT (id) DO NOTHING;

-- ================================================================
-- SELESAI! Verifikasi dengan query berikut:
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public';
-- ================================================================
