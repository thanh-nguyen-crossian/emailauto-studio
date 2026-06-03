-- EmailAuto Studio — history table. Run in the Supabase SQL editor.
-- One row per saved generation (whole campaign). RLS: each user sees only their own rows.

create table if not exists public.saved_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  name text not null,
  brand_id text not null,
  send_date date,
  data jsonb not null
);

create index if not exists saved_versions_user_idx on public.saved_versions (user_id, created_at desc);

alter table public.saved_versions enable row level security;

create policy "select own versions"
  on public.saved_versions for select
  using (auth.uid() = user_id);

create policy "insert own versions"
  on public.saved_versions for insert
  with check (auth.uid() = user_id);

create policy "delete own versions"
  on public.saved_versions for delete
  using (auth.uid() = user_id);
