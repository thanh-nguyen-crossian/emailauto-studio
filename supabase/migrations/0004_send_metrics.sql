-- EmailAuto Studio — SendGrid performance feedback loop (F1.1).
-- Run in the Supabase SQL editor. Adds metrics + send linkage columns to send_history so stats
-- pulled from SendGrid can be joined back to the creative levers that earned them, plus a
-- performance_snapshots table for brand-level rollups (winner lever stats, winning-copy corpus).

alter table public.send_history
  add column if not exists singlesend_id text,
  add column if not exists design_id text,
  add column if not exists template_id text,
  add column if not exists delivered integer,
  add column if not exists unique_opens integer,
  add column if not exists unique_clicks integer,
  add column if not exists bounces integer,
  add column if not exists unsubscribes integer,
  add column if not exists spam_reports integer,
  add column if not exists clicks_by_url jsonb not null default '{}'::jsonb,
  add column if not exists stats_synced_at timestamptz,
  add column if not exists revenue numeric;

create index if not exists send_history_singlesend_idx
  on public.send_history (singlesend_id)
  where singlesend_id is not null;

-- Rows awaiting their first (or a refreshed) stats pull — the sync route scans this.
create index if not exists send_history_stats_pending_idx
  on public.send_history (user_id, stats_synced_at)
  where singlesend_id is not null;

create table if not exists public.performance_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  brand_id text not null,
  period_start date not null,
  period_end date not null,
  -- { signal: PerformanceSignal, winningCorpus?: { subjects: string[], openers: string[] } }
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists performance_snapshots_user_brand_idx
  on public.performance_snapshots (user_id, brand_id, created_at desc);

alter table public.performance_snapshots enable row level security;

drop policy if exists "select own performance snapshots" on public.performance_snapshots;
create policy "select own performance snapshots"
  on public.performance_snapshots for select
  using (auth.uid() = user_id);

drop policy if exists "insert own performance snapshots" on public.performance_snapshots;
create policy "insert own performance snapshots"
  on public.performance_snapshots for insert
  with check (auth.uid() = user_id);

drop policy if exists "update own performance snapshots" on public.performance_snapshots;
create policy "update own performance snapshots"
  on public.performance_snapshots for update
  using (auth.uid() = user_id);

drop policy if exists "delete own performance snapshots" on public.performance_snapshots;
create policy "delete own performance snapshots"
  on public.performance_snapshots for delete
  using (auth.uid() = user_id);
