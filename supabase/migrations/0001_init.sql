-- Hidden Agenda — schema + Row Level Security.
-- Privacy model:
--   * entries are readable ONLY by their author (a partner never reads the
--     other's raw irritation/happy logs).
--   * tasks are readable ONLY by the doer, and expose just the positive action
--     (title + instruction + status). The chosen THEME and the internal
--     RATIONALE live in task_internals, which has RLS on and NO policies, so
--     no browser session can ever read them. Only the service role (server
--     /api routes) can, for generation and reveal.
--   * guesses are written only by the service role (via /api/guess) and read
--     only by the guesser.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists couples (
  id uuid primary key default gen_random_uuid(),
  invite_code text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists couple_members (
  couple_id uuid not null references couples(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (couple_id, user_id),
  unique (user_id) -- a user belongs to at most one couple
);

create table if not exists entries (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  subject_id uuid not null references auth.users(id) on delete cascade,
  log_date date not null,
  irritation_text text not null default '',
  happy_text text not null default '',
  irritation_theme text,
  happy_theme text,
  created_at timestamptz not null default now(),
  unique (author_id, log_date) -- one log per author per day
);
create index if not exists entries_subject_idx on entries (couple_id, subject_id, log_date);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples(id) on delete cascade,
  doer_id uuid not null references auth.users(id) on delete cascade,
  guesser_id uuid not null references auth.users(id) on delete cascade,
  task_date date not null,
  title text not null,
  instruction text not null,
  status text not null default 'assigned',
  created_at timestamptz not null default now(),
  unique (couple_id, doer_id, task_date)
);
create index if not exists tasks_couple_date_idx on tasks (couple_id, task_date);

-- Never exposed to either partner. Service role only.
create table if not exists task_internals (
  task_id uuid primary key references tasks(id) on delete cascade,
  theme text not null,
  rationale text not null default '',
  source_summary text not null default ''
);

create table if not exists guesses (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  guesser_id uuid not null references auth.users(id) on delete cascade,
  guessed_theme text not null,
  guess_text text not null default '',
  is_correct boolean not null default false,
  created_at timestamptz not null default now(),
  unique (task_id, guesser_id)
);

-- ---------------------------------------------------------------------------
-- Helper functions (SECURITY DEFINER avoids recursive RLS on couple_members)
-- ---------------------------------------------------------------------------

create or replace function my_couple_id()
returns uuid language sql stable security definer set search_path = public as $$
  select couple_id from couple_members where user_id = auth.uid() limit 1;
$$;

create or replace function gen_invite_code()
returns text language plpgsql as $$
declare
  alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; -- no ambiguous chars
  result text := '';
  i int;
begin
  for i in 1..6 loop
    result := result || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return result;
end;
$$;

create or replace function create_couple()
returns couples language plpgsql security definer set search_path = public as $$
declare
  c couples;
  code text;
begin
  if exists (select 1 from couple_members where user_id = auth.uid()) then
    raise exception 'already in a couple';
  end if;
  loop
    code := gen_invite_code();
    exit when not exists (select 1 from couples where invite_code = code);
  end loop;
  insert into couples (invite_code) values (code) returning * into c;
  insert into couple_members (couple_id, user_id) values (c.id, auth.uid());
  return c;
end;
$$;

create or replace function join_couple(p_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  c couples;
  member_count int;
begin
  if exists (select 1 from couple_members where user_id = auth.uid()) then
    raise exception 'already in a couple';
  end if;
  select * into c from couples where invite_code = upper(trim(p_code));
  if c.id is null then
    raise exception 'invalid code';
  end if;
  select count(*) into member_count from couple_members where couple_id = c.id;
  if member_count >= 2 then
    raise exception 'couple is full';
  end if;
  insert into couple_members (couple_id, user_id) values (c.id, auth.uid());
  return c.id;
end;
$$;

-- Create a profile row automatically on signup.
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table profiles enable row level security;
alter table couples enable row level security;
alter table couple_members enable row level security;
alter table entries enable row level security;
alter table tasks enable row level security;
alter table task_internals enable row level security; -- no policies => locked
alter table guesses enable row level security;

-- profiles: read self or partner; write self
drop policy if exists profiles_read on profiles;
create policy profiles_read on profiles for select
  using (id = auth.uid() or id in (select user_id from couple_members where couple_id = my_couple_id()));
drop policy if exists profiles_insert on profiles;
create policy profiles_insert on profiles for insert with check (id = auth.uid());
drop policy if exists profiles_update on profiles;
create policy profiles_update on profiles for update using (id = auth.uid()) with check (id = auth.uid());

-- couples: members read theirs
drop policy if exists couples_read on couples;
create policy couples_read on couples for select using (id = my_couple_id());

-- couple_members: read members of your couple
drop policy if exists members_read on couple_members;
create policy members_read on couple_members for select using (couple_id = my_couple_id());

-- entries: AUTHOR-ONLY read; insert as self into own couple
drop policy if exists entries_read on entries;
create policy entries_read on entries for select using (author_id = auth.uid());
drop policy if exists entries_insert on entries;
create policy entries_insert on entries for insert
  with check (author_id = auth.uid() and couple_id = my_couple_id());
drop policy if exists entries_update on entries;
create policy entries_update on entries for update
  using (author_id = auth.uid()) with check (author_id = auth.uid());

-- tasks: DOER-ONLY read; doer may update (to mark complete)
drop policy if exists tasks_read on tasks;
create policy tasks_read on tasks for select using (doer_id = auth.uid());
drop policy if exists tasks_update on tasks;
create policy tasks_update on tasks for update using (doer_id = auth.uid()) with check (doer_id = auth.uid());

-- guesses: GUESSER-ONLY read (inserts happen via service role)
drop policy if exists guesses_read on guesses;
create policy guesses_read on guesses for select using (guesser_id = auth.uid());
