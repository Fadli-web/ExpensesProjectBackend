-- ============================================================
-- Expense Notes — Supabase schema
-- Run this in Supabase Studio: SQL Editor > New query > Run
-- ============================================================

-- Needed for gen_random_uuid()
create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- 1. PROFILES
-- One row per auth user. This is what makes profile data
-- (name, avatar) permanent and identical across every device,
-- since it's keyed to the permanent auth.users.id, not to a
-- browser or local device.
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  avatar_path text, -- storage object path, so we can delete the old file on replace
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);

-- Auto-create a profile row the moment a new auth user is created
-- (covers both email/password signup and Google OAuth signup).
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ------------------------------------------------------------
-- 2. TRANSACTIONS
-- ------------------------------------------------------------
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  merchant text not null,
  amount numeric(14,2) not null,
  category text not null default 'Lainnya',
  payment_method text,
  transaction_date date not null default current_date,
  notes text,
  items jsonb,              -- parsed line items from OCR, optional
  receipt_path text,        -- path inside the receipts storage bucket
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_transactions_user_date
  on public.transactions (user_id, transaction_date desc);

create index if not exists idx_transactions_user_category
  on public.transactions (user_id, category);

alter table public.transactions enable row level security;

create policy "transactions_select_own" on public.transactions
  for select using (auth.uid() = user_id);

create policy "transactions_insert_own" on public.transactions
  for insert with check (auth.uid() = user_id);

create policy "transactions_update_own" on public.transactions
  for update using (auth.uid() = user_id);

create policy "transactions_delete_own" on public.transactions
  for delete using (auth.uid() = user_id);

-- keep updated_at fresh
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_transactions_updated_at on public.transactions;
create trigger trg_transactions_updated_at
  before update on public.transactions
  for each row execute procedure public.set_updated_at();

-- ============================================================
-- 3. STORAGE BUCKETS
-- Create these once in Supabase Dashboard > Storage
--   - "avatars"  -> keep PUBLIC (so avatar_url can be a plain public URL)
--   - "receipts" -> keep PRIVATE (accessed only via short-lived signed URLs)
-- Then run the policies below.
-- ============================================================

-- Avatars: public read, but a user may only write/delete inside their own
-- folder, e.g. avatars/<user_id>/avatar.jpg
create policy "avatar_public_read"
on storage.objects for select
using ( bucket_id = 'avatars' );

create policy "avatar_owner_write"
on storage.objects for insert
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "avatar_owner_update"
on storage.objects for update
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "avatar_owner_delete"
on storage.objects for delete
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Receipts: fully private, only the owner (folder = their user id) can
-- read/write/delete their own receipt images. Signed URLs are issued
-- server-side with the service role key.
create policy "receipt_owner_all"
on storage.objects for all
using (
  bucket_id = 'receipts'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'receipts'
  and (storage.foldername(name))[1] = auth.uid()::text
);
