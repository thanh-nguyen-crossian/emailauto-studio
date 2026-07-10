-- EmailAuto Studio — Google SSO org auto-activation. Run in the Supabase SQL editor.
-- Org members signing in with a @crossian.com Google account skip the pending/approval
-- gate (the GCP OAuth consent screen is "Internal", so only org accounts can complete
-- Google sign-in at all). Everyone else still starts 'pending' as in 0002.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, status, is_admin)
  values (
    new.id,
    new.email,
    case when new.email ilike '%@crossian.com' then 'active' else 'pending' end,
    false
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
