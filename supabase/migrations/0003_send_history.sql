-- EmailAuto Studio — recent-send fatigue memory.
-- One row per brand/segment/option that the user explicitly records as sent.

create table if not exists public.send_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  brand_id text not null,
  segment_code text not null,
  send_date date,
  option_key text check (option_key in ('a', 'b')),
  angle text,
  framework text,
  opener_mechanic text,
  emotional_arc text,
  visual_pattern text,
  hero_slug text,
  source_version_id uuid,
  data jsonb not null default '{}'::jsonb
);

create index if not exists send_history_user_brand_idx
  on public.send_history (user_id, brand_id, created_at desc);

create index if not exists send_history_user_brand_segment_idx
  on public.send_history (user_id, brand_id, segment_code, created_at desc);

alter table public.send_history enable row level security;

create policy "select own send history"
  on public.send_history for select
  using (auth.uid() = user_id);

create policy "insert own send history"
  on public.send_history for insert
  with check (auth.uid() = user_id);

create policy "delete own send history"
  on public.send_history for delete
  using (auth.uid() = user_id);
