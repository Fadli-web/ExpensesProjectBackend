-- =========================================================
-- Jalankan seluruh file ini di Supabase Dashboard > SQL Editor
-- =========================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------
-- 1. Tabel transactions
-- ---------------------------------------------------------
create table if not exists public.transactions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  merchant          text not null,
  amount            numeric(14,2) not null,
  category          text not null default 'Lainnya',
  transaction_date  date not null default current_date,
  payment_method    text,
  notes             text,
  items             jsonb not null default '[]'::jsonb,
  receipt_path      text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_transactions_user_date
  on public.transactions (user_id, transaction_date desc);

create index if not exists idx_transactions_user_merchant
  on public.transactions (user_id, merchant);

create index if not exists idx_transactions_user_category
  on public.transactions (user_id, category);

-- ---------------------------------------------------------
-- 2. Trigger updated_at otomatis
-- ---------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_set_updated_at on public.transactions;
create trigger trg_set_updated_at
before update on public.transactions
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------
-- 3. Row Level Security (RLS)
-- ---------------------------------------------------------
alter table public.transactions enable row level security;

drop policy if exists "Users can view own transactions" on public.transactions;
create policy "Users can view own transactions"
  on public.transactions for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own transactions" on public.transactions;
create policy "Users can insert own transactions"
  on public.transactions for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own transactions" on public.transactions;
create policy "Users can update own transactions"
  on public.transactions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own transactions" on public.transactions;
create policy "Users can delete own transactions"
  on public.transactions for delete
  using (auth.uid() = user_id);

-- ---------------------------------------------------------
-- 4. Storage bucket privat untuk foto struk
-- ---------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

-- Struktur path wajib: {user_id}/{nama_file}.jpg  -> folder pertama = user_id pemilik
drop policy if exists "Users can upload own receipts" on storage.objects;
create policy "Users can upload own receipts"
  on storage.objects for insert
  with check (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can view own receipts" on storage.objects;
create policy "Users can view own receipts"
  on storage.objects for select
  using (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can delete own receipts" on storage.objects;
create policy "Users can delete own receipts"
  on storage.objects for delete
  using (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
