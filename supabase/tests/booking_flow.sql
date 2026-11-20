-- Booking / RLS integration test against the local database.
-- Run: npm run test:db
-- Everything runs in one transaction and is rolled back.
begin;

-- Four users: organizer O, players A and B, outsider X.
insert into auth.users (id, email, raw_user_meta_data, aud, role) values
  ('00000000-0000-0000-0000-00000000000a', 'o@test.np', '{"full_name":"Org"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000b', 'a@test.np', '{"full_name":"Asha"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000c', 'b@test.np', '{"full_name":"Bikash"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000d', 'x@test.np', '{"full_name":"Outsider"}', 'authenticated', 'authenticated');

create schema tests;
create function tests.act_as(uid text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;
create function tests.check(ok boolean, label text) returns void language plpgsql as $$
begin
  if ok is not true then raise exception 'FAIL: %', label; end if;
  raise notice 'ok: %', label;
end $$;
grant usage on schema tests to authenticated;
grant execute on all functions in schema tests to authenticated;

set local role authenticated;

-- Organizer creates a group and a 1-spot session.
select tests.act_as('00000000-0000-0000-0000-00000000000a');
-- RETURNING mirrors the app's insert(...).select('id'); it needs the owner SELECT path.
insert into public.groups (id, name, invite_code)
values ('10000000-0000-0000-0000-000000000001', 'Jhamsikhel Dinks', 'TEST01')
returning id;
select tests.check((select role = 'organizer' from public.group_members
  where user_id = '00000000-0000-0000-0000-00000000000a'), 'creator is organizer');
insert into public.sessions (id, group_id, title, starts_at, ends_at, capacity)
values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Sat open play',
        now() + interval '2 days', now() + interval '2 days 2 hours', 1);

-- Outsider sees nothing and cannot book.
select tests.act_as('00000000-0000-0000-0000-00000000000d');
select tests.check((select count(*) = 0 from public.sessions), 'outsider sees no sessions');
select tests.check((select count(*) = 0 from public.groups), 'outsider sees no private groups');
do $$ begin
  perform public.book_session('20000000-0000-0000-0000-000000000001');
  raise exception 'FAIL: outsider booked';
exception when sqlstate 'P0002' then raise notice 'ok: outsider cannot book';
end $$;

-- A and B join with the invite code (trimmed, case-insensitive).
select tests.act_as('00000000-0000-0000-0000-00000000000b');
select tests.check(public.join_group(' test01 ') = '10000000-0000-0000-0000-000000000001', 'A joins via code');
select tests.act_as('00000000-0000-0000-0000-00000000000c');
select public.join_group('TEST01');

-- Members cannot create sessions or write bookings directly.
do $$ begin
  insert into public.sessions (group_id, title, starts_at, ends_at, capacity)
  values ('10000000-0000-0000-0000-000000000001', 'Hack', now() + interval '1 day', now() + interval '1 day 1 hour', 4);
  raise exception 'FAIL: member created session';
exception when insufficient_privilege then raise notice 'ok: member cannot create session';
end $$;
do $$ begin
  insert into public.bookings (session_id, user_id, status)
  values ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000c', 'confirmed');
  raise exception 'FAIL: direct booking insert';
exception when insufficient_privilege then raise notice 'ok: no direct booking insert';
end $$;

-- A books -> confirmed; B books -> waitlisted.
select tests.act_as('00000000-0000-0000-0000-00000000000b');
select tests.check(public.book_session('20000000-0000-0000-0000-000000000001') = 'confirmed', 'A confirmed');
select tests.check(public.book_session('20000000-0000-0000-0000-000000000001') = 'confirmed', 'rebook is idempotent');
select tests.act_as('00000000-0000-0000-0000-00000000000c');
select tests.check(public.book_session('20000000-0000-0000-0000-000000000001') = 'waitlisted', 'B waitlisted');
select tests.check((select confirmed_count = 1 and waitlist_count = 1 and my_status = 'waitlisted'
  from public.session_overview where id = '20000000-0000-0000-0000-000000000001'), 'overview counts for B');
select tests.check((select count(*) = 3 from public.profiles), 'B sees only groupmate profiles');

-- A cancels -> B promoted.
select tests.act_as('00000000-0000-0000-0000-00000000000b');
select public.cancel_booking('20000000-0000-0000-0000-000000000001');
select tests.check((select status = 'confirmed' from public.bookings
  where user_id = '00000000-0000-0000-0000-00000000000c'), 'B promoted after A cancels');
select tests.check((select not late_cancel from public.bookings
  where user_id = '00000000-0000-0000-0000-00000000000b'), 'early cancel not flagged late');

-- A re-books -> waitlisted (the spot is B's now).
select tests.check(public.book_session('20000000-0000-0000-0000-000000000001') = 'waitlisted', 'A rebooks onto waitlist');

-- Organizer raises capacity -> A promoted.
select tests.act_as('00000000-0000-0000-0000-00000000000a');
update public.sessions set capacity = 2 where id = '20000000-0000-0000-0000-000000000001';
select tests.check((select status = 'confirmed' from public.bookings
  where user_id = '00000000-0000-0000-0000-00000000000b'), 'A promoted on capacity raise');

-- Organizer cannot reassign the group owner.
do $$ begin
  update public.groups set owner_id = '00000000-0000-0000-0000-00000000000b';
  raise exception 'FAIL: owner reassigned';
exception when insufficient_privilege then raise notice 'ok: owner_id immutable';
end $$;

-- Skill restriction.
update public.sessions set skill_min = 3.5 where id = '20000000-0000-0000-0000-000000000001';
select tests.act_as('00000000-0000-0000-0000-00000000000c');
select public.cancel_booking('20000000-0000-0000-0000-000000000001');
update public.profiles set skill_level = 3.0 where id = '00000000-0000-0000-0000-00000000000c';
do $$ begin
  perform public.book_session('20000000-0000-0000-0000-000000000001');
  raise exception 'FAIL: skill check bypassed';
exception when raise_exception then
  if sqlerrm like 'FAIL%' then raise; end if;
  raise notice 'ok: skill restriction enforced (%)', sqlerrm;
end $$;

-- Late-cancel flag when the session starts inside the cutoff window.
select tests.act_as('00000000-0000-0000-0000-00000000000a');
update public.sessions
set skill_min = null, starts_at = now() + interval '1 hour', ends_at = now() + interval '3 hours'
where id = '20000000-0000-0000-0000-000000000001';
select tests.act_as('00000000-0000-0000-0000-00000000000b');
select public.cancel_booking('20000000-0000-0000-0000-000000000001');
select tests.check((select late_cancel from public.bookings
  where user_id = '00000000-0000-0000-0000-00000000000b'), 'late cancel flagged');

rollback;
