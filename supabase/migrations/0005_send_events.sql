-- EmailAuto Studio — SendGrid Event Webhook ingestion (F1.6).
-- Run in the Supabase SQL editor. Adds send_events, the raw per-recipient event log fed by the
-- signed Event Webhook receiver (app/api/webhooks/sendgrid). Populated only by the service-role
-- key (webhook receiver) and read only by a server-side nightly-fold job (not built in this
-- ticket) and by admins — no end-user RLS access, so no permissive policies are added below.

create table if not exists public.send_events (
  id uuid primary key default gen_random_uuid(),
  singlesend_id text,
  event text not null,
  -- SHA-256 hex hash of the recipient email — never store the raw address (privacy requirement).
  email_hash text,
  url text,
  sg_event_id text,
  sg_message_id text,
  sg_timestamp timestamptz,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.send_events
  add column if not exists sg_event_id text,
  add column if not exists sg_message_id text;

create index if not exists send_events_singlesend_idx
  on public.send_events (singlesend_id)
  where singlesend_id is not null;

create index if not exists send_events_created_idx
  on public.send_events (created_at desc);

create unique index if not exists send_events_sg_event_id_uidx
  on public.send_events (sg_event_id);

-- RLS enabled with no permissive policies: default-deny for anon/authenticated roles. Only the
-- service-role key (which bypasses RLS) can read or write this table.
alter table public.send_events enable row level security;
