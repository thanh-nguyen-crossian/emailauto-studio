-- EmailAuto Studio — user profiles + admin gating. Run in the Supabase SQL editor.
-- Every signup starts as 'pending' and must be approved by an admin before using the app.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  status text not null default 'pending' check (status in ('pending', 'active', 'inactive')),
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- A user may read their own profile (to learn their status). Admin reads/writes go through
-- the service-role key in server routes, which bypasses RLS.
drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles for select using (auth.uid() = id);

-- Auto-create a pending profile whenever a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, status, is_admin)
  values (new.id, new.email, 'pending', false)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill profiles for any users that already exist.
insert into public.profiles (id, email, status, is_admin)
select id, email, 'pending', false from auth.users
on conflict (id) do nothing;

-- ⬇️ AFTER your super-admin has signed up, run this with their email to grant access:
-- update public.profiles set is_admin = true, status = 'active' where email = 'you@company.com';
