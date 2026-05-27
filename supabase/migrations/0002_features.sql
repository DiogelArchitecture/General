-- Hidden Agenda — feature round 2: mission swap, gentle streak/stats,
-- memory lane, and the evening reminder email. Run after 0001_init.sql.

-- ---------------------------------------------------------------------------
-- Mission swap: let the doer regenerate today's gesture a capped number of
-- times. The theme stays fixed (so the guess game is unaffected); only the
-- surface gesture changes.
-- ---------------------------------------------------------------------------
alter table tasks add column if not exists swap_count int not null default 0;

-- ---------------------------------------------------------------------------
-- Evening reminder: the cron addresses users by email and avoids double-sends.
-- email is stored on the profile so the cron never needs the auth admin API.
-- It is NEVER selected by any client-facing query (only the service-role cron
-- reads it), so it does not leak to the partner even though RLS would allow it.
-- ---------------------------------------------------------------------------
alter table profiles add column if not exists email text not null default '';
alter table profiles add column if not exists notify_opt_in boolean not null default true;
alter table profiles add column if not exists last_reminded date;

-- Keep the profile email in sync with auth on signup.
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', ''),
    coalesce(new.email, '')
  )
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

-- Backfill emails for anyone who signed up before this migration.
update profiles p
set email = u.email
from auth.users u
where u.id = p.id and (p.email is null or p.email = '');
