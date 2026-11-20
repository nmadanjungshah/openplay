-- OpenPlay M0 + M1: profiles, groups, members, sessions, bookings with waitlist.
--
-- Security model
--   * Every table in `public` has RLS enabled.
--   * Privileged logic (membership checks used by policies, booking, joining a
--     group by invite code, waitlist promotion) lives in the unexposed `private`
--     schema as SECURITY DEFINER functions.
--   * The app calls thin SECURITY INVOKER wrappers in `public` (exposed via the
--     Data API as RPCs), which delegate to `private`.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.member_role as enum ('organizer', 'member');
create type public.session_status as enum ('scheduled', 'cancelled');
create type public.booking_status as enum ('confirmed', 'waitlisted', 'cancelled');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  full_name    text not null default '' check (char_length(full_name) <= 80),
  skill_level  numeric(2, 1) check (skill_level between 1.0 and 8.0),
  dupr_id      text check (char_length(dupr_id) <= 20),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.groups (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (char_length(name) between 2 and 80),
  description  text not null default '' check (char_length(description) <= 1000),
  city         text not null default '' check (char_length(city) <= 80),
  is_public    boolean not null default false,
  invite_code  text not null unique
               default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)),
  owner_id     uuid not null default auth.uid() references public.profiles (id),
  created_at   timestamptz not null default now()
);

create table public.group_members (
  group_id   uuid not null references public.groups (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  role       public.member_role not null default 'member',
  joined_at  timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index group_members_user_idx on public.group_members (user_id);

create table public.sessions (
  id                   uuid primary key default gen_random_uuid(),
  group_id             uuid not null references public.groups (id) on delete cascade,
  recurrence_id        uuid,            -- shared by sessions created as one weekly series
  title                text not null check (char_length(title) between 2 and 80),
  location             text not null default '' check (char_length(location) <= 200),
  notes                text not null default '' check (char_length(notes) <= 1000),
  starts_at            timestamptz not null,
  ends_at              timestamptz not null,
  capacity             int not null check (capacity between 1 and 200),
  courts               int not null default 1 check (courts between 1 and 50),
  skill_min            numeric(2, 1) check (skill_min between 1.0 and 8.0),
  skill_max            numeric(2, 1) check (skill_max between 1.0 and 8.0),
  fee_npr              int not null default 0 check (fee_npr >= 0),
  cancel_cutoff_hours  int not null default 2 check (cancel_cutoff_hours between 0 and 168),
  status               public.session_status not null default 'scheduled',
  created_by           uuid not null default auth.uid() references public.profiles (id),
  created_at           timestamptz not null default now(),
  check (ends_at > starts_at),
  check (skill_min is null or skill_max is null or skill_min <= skill_max)
);
create index sessions_group_starts_idx on public.sessions (group_id, starts_at);

create table public.bookings (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null references public.sessions (id) on delete cascade,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  status        public.booking_status not null,
  queued_at     timestamptz not null default now(),  -- ordering for the waitlist
  cancelled_at  timestamptz,
  late_cancel   boolean not null default false,      -- cancelled inside the cutoff window
  created_at    timestamptz not null default now(),
  unique (session_id, user_id)
);
create index bookings_session_status_idx on public.bookings (session_id, status, queued_at);
create index bookings_user_idx on public.bookings (user_id);

-- ---------------------------------------------------------------------------
-- Private helpers (SECURITY DEFINER, not exposed through the Data API)
-- ---------------------------------------------------------------------------
create function private.is_group_member(gid uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.group_members m
    where m.group_id = gid and m.user_id = (select auth.uid())
  );
$$;

create function private.is_group_organizer(gid uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.group_members m
    where m.group_id = gid and m.user_id = (select auth.uid()) and m.role = 'organizer'
  );
$$;

create function private.shares_group_with(other uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.group_members a
    join public.group_members b on b.group_id = a.group_id
    where a.user_id = (select auth.uid()) and b.user_id = other
  );
$$;

-- New auth user -> profile row.
create function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(left(new.raw_user_meta_data ->> 'full_name', 80), ''));
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

-- Group creator becomes its first organizer.
create function private.handle_new_group()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.group_members (group_id, user_id, role)
  values (new.id, new.owner_id, 'organizer');
  return new;
end;
$$;

create trigger on_group_created
after insert on public.groups
for each row execute function private.handle_new_group();

-- Fill open spots from the waitlist (oldest first). Caller must hold the session lock.
create function private.promote_waitlist(sid uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  cap int;
  taken int;
begin
  select s.capacity into cap from public.sessions s where s.id = sid;
  select count(*) into taken from public.bookings b
  where b.session_id = sid and b.status = 'confirmed';

  if taken < cap then
    update public.bookings b set status = 'confirmed'
    where b.id in (
      select w.id from public.bookings w
      where w.session_id = sid and w.status = 'waitlisted'
      order by w.queued_at, w.id
      limit (cap - taken)
    );
  end if;
end;
$$;

-- Book (or re-book) the caller into a session. Returns the resulting status.
create function private.book_session(sid uuid)
returns public.booking_status language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  s public.sessions;
  my_skill numeric;
  taken int;
  existing public.bookings;
  new_status public.booking_status;
begin
  if uid is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;

  -- Lock the session row so concurrent bookings serialize on capacity.
  select * into s from public.sessions where id = sid for update;
  if not found or not private.is_group_member(s.group_id) then
    raise exception 'Session not found' using errcode = 'P0002';
  end if;
  if s.status <> 'scheduled' then
    raise exception 'This session was cancelled';
  end if;
  if s.starts_at <= now() then
    raise exception 'This session has already started';
  end if;

  select p.skill_level into my_skill from public.profiles p where p.id = uid;
  if my_skill is not null and (
       (s.skill_min is not null and my_skill < s.skill_min) or
       (s.skill_max is not null and my_skill > s.skill_max)) then
    raise exception 'This session is for skill levels % to %',
      coalesce(s.skill_min::text, 'any'), coalesce(s.skill_max::text, 'any');
  end if;

  select * into existing from public.bookings b where b.session_id = sid and b.user_id = uid;
  if found and existing.status <> 'cancelled' then
    return existing.status;  -- idempotent
  end if;

  select count(*) into taken from public.bookings b
  where b.session_id = sid and b.status = 'confirmed';

  -- Anyone already waiting goes first, so a re-booker cannot jump the queue.
  if taken < s.capacity and not exists (
       select 1 from public.bookings b where b.session_id = sid and b.status = 'waitlisted') then
    new_status := 'confirmed';
  else
    new_status := 'waitlisted';
  end if;

  insert into public.bookings (session_id, user_id, status, queued_at)
  values (sid, uid, new_status, now())
  on conflict (session_id, user_id) do update
    set status = excluded.status, queued_at = excluded.queued_at,
        cancelled_at = null, late_cancel = false;

  return new_status;
end;
$$;

-- Cancel the caller's booking; promotes the waitlist if a confirmed spot opens.
create function private.cancel_booking(sid uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  s public.sessions;
  b public.bookings;
begin
  if uid is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;

  select * into s from public.sessions where id = sid for update;
  if not found or not private.is_group_member(s.group_id) then
    raise exception 'Session not found' using errcode = 'P0002';
  end if;

  select * into b from public.bookings x where x.session_id = sid and x.user_id = uid;
  if not found or b.status = 'cancelled' then
    return;
  end if;

  update public.bookings
  set status = 'cancelled',
      cancelled_at = now(),
      late_cancel = (b.status = 'confirmed'
                     and now() > s.starts_at - make_interval(hours => s.cancel_cutoff_hours))
  where id = b.id;

  if b.status = 'confirmed' then
    perform private.promote_waitlist(sid);
  end if;
end;
$$;

-- Join a group with its invite code. Returns the group id.
create function private.join_group(code text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  gid uuid;
begin
  if uid is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  select g.id into gid from public.groups g where g.invite_code = upper(trim(code));
  if gid is null then
    raise exception 'No group found for that invite code' using errcode = 'P0002';
  end if;
  insert into public.group_members (group_id, user_id, role)
  values (gid, uid, 'member')
  on conflict do nothing;
  return gid;
end;
$$;

-- Join a public group directly (no code needed).
create function private.join_public_group(gid uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  if not exists (select 1 from public.groups g where g.id = gid and g.is_public) then
    raise exception 'Group not found' using errcode = 'P0002';
  end if;
  insert into public.group_members (group_id, user_id, role)
  values (gid, uid, 'member')
  on conflict do nothing;
end;
$$;

-- Capacity raised by an organizer -> pull people off the waitlist.
create function private.handle_session_capacity()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.capacity > old.capacity and new.status = 'scheduled' then
    perform private.promote_waitlist(new.id);
  end if;
  return new;
end;
$$;

create trigger on_session_capacity_change
after update of capacity on public.sessions
for each row execute function private.handle_session_capacity();

create function private.touch_updated_at()
returns trigger language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles
for each row execute function private.touch_updated_at();

-- Only callable by signed-in users.
revoke execute on all functions in schema private from public, anon;
grant execute on function
  private.is_group_member(uuid), private.is_group_organizer(uuid),
  private.shares_group_with(uuid), private.book_session(uuid),
  private.cancel_booking(uuid), private.join_group(text),
  private.join_public_group(uuid)
to authenticated;

-- ---------------------------------------------------------------------------
-- Public RPC wrappers (SECURITY INVOKER)
-- ---------------------------------------------------------------------------
create function public.book_session(session_id uuid)
returns public.booking_status language sql security invoker set search_path = ''
as $$ select private.book_session(session_id); $$;

create function public.cancel_booking(session_id uuid)
returns void language sql security invoker set search_path = ''
as $$ select private.cancel_booking(session_id); $$;

create function public.join_group(code text)
returns uuid language sql security invoker set search_path = ''
as $$ select private.join_group(code); $$;

create function public.join_public_group(group_id uuid)
returns void language sql security invoker set search_path = ''
as $$ select private.join_public_group(group_id); $$;

revoke execute on function
  public.book_session(uuid), public.cancel_booking(uuid),
  public.join_group(text), public.join_public_group(uuid)
from public, anon;
grant execute on function
  public.book_session(uuid), public.cancel_booking(uuid),
  public.join_group(text), public.join_public_group(uuid)
to authenticated;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.profiles      enable row level security;
alter table public.groups        enable row level security;
alter table public.group_members enable row level security;
alter table public.sessions      enable row level security;
alter table public.bookings      enable row level security;

-- profiles: see yourself and people you share a group with; edit only yourself.
create policy "profiles: read self or groupmates" on public.profiles
for select to authenticated
using (id = (select auth.uid()) or (select private.shares_group_with(id)));

create policy "profiles: update self" on public.profiles
for update to authenticated
using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- groups
create policy "groups: read public or joined" on public.groups
for select to authenticated
-- owner_id check lets INSERT ... RETURNING succeed before the organizer membership row is visible.
using (is_public or owner_id = (select auth.uid()) or (select private.is_group_member(id)));

create policy "groups: create as owner" on public.groups
for insert to authenticated
with check (owner_id = (select auth.uid()));

create policy "groups: organizers update" on public.groups
for update to authenticated
using ((select private.is_group_organizer(id)))
with check ((select private.is_group_organizer(id)));

create policy "groups: owner deletes" on public.groups
for delete to authenticated
using (owner_id = (select auth.uid()));

-- group_members: inserts happen via triggers / join RPCs only.
create policy "members: read own groups" on public.group_members
for select to authenticated
using ((select private.is_group_member(group_id)));

-- The group owner's own membership can't be demoted or removed by other organizers.
create policy "members: organizers change roles" on public.group_members
for update to authenticated
using (
  (select private.is_group_organizer(group_id))
  and user_id <> (select g.owner_id from public.groups g where g.id = group_id)
)
with check ((select private.is_group_organizer(group_id)));

create policy "members: leave or remove" on public.group_members
for delete to authenticated
using (
  user_id <> (select g.owner_id from public.groups g where g.id = group_id)
  and (user_id = (select auth.uid()) or (select private.is_group_organizer(group_id)))
);

-- sessions
create policy "sessions: members read" on public.sessions
for select to authenticated
using ((select private.is_group_member(group_id)));

create policy "sessions: organizers create" on public.sessions
for insert to authenticated
with check ((select private.is_group_organizer(group_id)) and created_by = (select auth.uid()));

create policy "sessions: organizers update" on public.sessions
for update to authenticated
using ((select private.is_group_organizer(group_id)))
with check ((select private.is_group_organizer(group_id)));

create policy "sessions: organizers delete" on public.sessions
for delete to authenticated
using ((select private.is_group_organizer(group_id)));

-- bookings: read-only from the client; writes go through the booking RPCs.
create policy "bookings: members read" on public.bookings
for select to authenticated
using (exists (
  select 1 from public.sessions s
  where s.id = session_id and (select private.is_group_member(s.group_id))
));

-- ---------------------------------------------------------------------------
-- Views (security_invoker so RLS of the caller applies)
-- ---------------------------------------------------------------------------
create view public.session_overview with (security_invoker = true) as
select
  s.*,
  g.name as group_name,
  (select count(*) from public.bookings b
    where b.session_id = s.id and b.status = 'confirmed')::int as confirmed_count,
  (select count(*) from public.bookings b
    where b.session_id = s.id and b.status = 'waitlisted')::int as waitlist_count,
  (select b.status from public.bookings b
    where b.session_id = s.id and b.user_id = (select auth.uid())) as my_status
from public.sessions s
join public.groups g on g.id = s.group_id;

-- Table privileges: anon gets nothing; authenticated is limited further by RLS.
revoke all on all tables in schema public from anon;
revoke insert, update, delete on public.bookings from authenticated;
revoke insert on public.group_members from authenticated;
revoke insert, delete on public.profiles from authenticated;

-- Column-level limits: owners, group ids and authorship are immutable from the client.
revoke update on public.profiles, public.groups, public.group_members, public.sessions
  from authenticated;
grant update (full_name, skill_level, dupr_id) on public.profiles to authenticated;
grant update (name, description, city, is_public) on public.groups to authenticated;
grant update (role) on public.group_members to authenticated;
grant update (title, location, notes, starts_at, ends_at, capacity, courts,
              skill_min, skill_max, fee_npr, cancel_cutoff_hours, status)
  on public.sessions to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime: live seat counts / waitlist movement
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.bookings, public.sessions;
