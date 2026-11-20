-- M2 payments, part 2: organizer QR payments with a verify step.
--
-- Flow
--   pay_at_court   : booking is confirmed immediately. The organizer marks the
--                    player paid (cash / eSewa / Khalti), or the player submits
--                    "I've paid" and the organizer verifies it.
--   pay_to_confirm : for a session with a fee, booking becomes `pending_payment`
--                    and the spot is held for `groups.hold_minutes`. The player
--                    pays to the organizer's eSewa/Khalti QR and submits the
--                    transaction ID (the hold pauses). The organizer confirms,
--                    which confirms the booking, or rejects, which starts a fresh
--                    hold so the player can resubmit. Unclaimed expired holds are
--                    released by pg_cron and the waitlist moves up.

-- ---------------------------------------------------------------------------
-- Group payment settings
-- ---------------------------------------------------------------------------
alter table public.groups
  add column payment_mode   public.payment_mode not null default 'pay_at_court',
  add column hold_minutes   int  not null default 15 check (hold_minutes between 5 and 120),
  add column esewa_id       text not null default '' check (char_length(esewa_id) <= 40),
  add column khalti_id      text not null default '' check (char_length(khalti_id) <= 40),
  add column esewa_qr_path  text check (char_length(esewa_qr_path) <= 200),
  add column khalti_qr_path text check (char_length(khalti_qr_path) <= 200),
  add column payment_note   text not null default '' check (char_length(payment_note) <= 500);

grant update (payment_mode, hold_minutes, esewa_id, khalti_id, esewa_qr_path, khalti_qr_path, payment_note)
  on public.groups to authenticated;

alter table public.bookings add column hold_expires_at timestamptz;
create index bookings_hold_idx on public.bookings (hold_expires_at)
  where status = 'pending_payment';

-- ---------------------------------------------------------------------------
-- Payments (one per booking)
-- ---------------------------------------------------------------------------
create table public.payments (
  id           uuid primary key default gen_random_uuid(),
  booking_id   uuid not null unique references public.bookings (id) on delete cascade,
  session_id   uuid not null references public.sessions (id) on delete cascade,
  group_id     uuid not null references public.groups (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  amount_npr   int  not null check (amount_npr >= 0),
  method       public.payment_method not null,
  status       public.payment_status not null,
  reference    text not null default '' check (char_length(reference) <= 100),
  proof_path   text check (char_length(proof_path) <= 300),
  note         text not null default '' check (char_length(note) <= 300),
  claimed_at   timestamptz,
  reviewed_by  uuid references public.profiles (id) on delete set null,
  reviewed_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index payments_session_idx on public.payments (session_id);
create index payments_group_status_idx on public.payments (group_id, status);
create index payments_user_idx on public.payments (user_id);
create index payments_reviewed_by_idx on public.payments (reviewed_by);

create trigger payments_touch before update on public.payments
for each row execute function private.touch_updated_at();

alter table public.payments enable row level security;

-- Players see their own payments; organizers see all payments in their groups.
create policy "payments: own or organizer" on public.payments
for select to authenticated
using (user_id = (select auth.uid()) or (select private.is_group_organizer(group_id)));

-- All writes go through the RPCs below.
revoke all on public.payments from anon;
revoke insert, update, delete on public.payments from authenticated;

alter publication supabase_realtime add table public.payments;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create function private.try_uuid(value text)
returns uuid language plpgsql immutable set search_path = ''
as $$
begin
  return value::uuid;
exception when others then
  return null;
end;
$$;

-- Does this session require payment before the spot is confirmed?
create function private.requires_prepay(sid uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select s.fee_npr > 0 and g.payment_mode = 'pay_to_confirm'
  from public.sessions s join public.groups g on g.id = s.group_id
  where s.id = sid;
$$;

-- Fill open spots from the waitlist (oldest first). Held spots count as taken.
create or replace function private.promote_waitlist(sid uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  cap int;
  taken int;
  prepay boolean := private.requires_prepay(sid);
  hold int;
begin
  select s.capacity, g.hold_minutes into cap, hold
  from public.sessions s join public.groups g on g.id = s.group_id where s.id = sid;
  select count(*) into taken from public.bookings b
  where b.session_id = sid and b.status in ('confirmed', 'pending_payment');

  if taken < cap then
    update public.bookings b
    set status = case
          when prepay and not exists (
            select 1 from public.payments p where p.booking_id = b.id and p.status = 'confirmed')
          then 'pending_payment'::public.booking_status
          else 'confirmed'::public.booking_status end,
        hold_expires_at = case when prepay then now() + make_interval(mins => hold) end
    where b.id in (
      select w.id from public.bookings w
      where w.session_id = sid and w.status = 'waitlisted'
      order by w.queued_at, w.id
      limit (cap - taken)
    );
    -- Holds only apply to pending bookings.
    update public.bookings set hold_expires_at = null
    where session_id = sid and status = 'confirmed' and hold_expires_at is not null;
  end if;
end;
$$;

-- Release unclaimed, expired holds for one session (caller holds the session lock).
create function private.release_expired_holds(sid uuid)
returns int language plpgsql security definer set search_path = ''
as $$
declare
  released int;
begin
  update public.bookings b
  set status = 'cancelled', cancelled_at = now(), hold_expires_at = null
  where b.session_id = sid
    and b.status = 'pending_payment'
    and b.hold_expires_at is not null
    and b.hold_expires_at < now()
    and not exists (select 1 from public.payments p where p.booking_id = b.id and p.status = 'claimed');
  get diagnostics released = row_count;
  if released > 0 then
    perform private.promote_waitlist(sid);
  end if;
  return released;
end;
$$;

-- Cron entry point: release expired holds everywhere.
create function private.expire_holds()
returns int language plpgsql security definer set search_path = ''
as $$
declare
  sid uuid;
  total int := 0;
begin
  for sid in
    select distinct b.session_id from public.bookings b
    where b.status = 'pending_payment' and b.hold_expires_at < now()
  loop
    perform 1 from public.sessions where id = sid for update;
    total := total + private.release_expired_holds(sid);
  end loop;
  return total;
end;
$$;

-- ---------------------------------------------------------------------------
-- Booking (replaces M1 versions)
-- ---------------------------------------------------------------------------
create or replace function private.book_session(sid uuid)
returns public.booking_status language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  s public.sessions;
  g public.groups;
  my_skill numeric;
  taken int;
  existing public.bookings;
  already_paid boolean := false;
  new_status public.booking_status;
begin
  if uid is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;

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
  select * into g from public.groups where id = s.group_id;

  select p.skill_level into my_skill from public.profiles p where p.id = uid;
  if my_skill is not null and (
       (s.skill_min is not null and my_skill < s.skill_min) or
       (s.skill_max is not null and my_skill > s.skill_max)) then
    raise exception 'This session is for skill levels % to %',
      coalesce(s.skill_min::text, 'any'), coalesce(s.skill_max::text, 'any');
  end if;

  perform private.release_expired_holds(sid);

  select * into existing from public.bookings b where b.session_id = sid and b.user_id = uid;
  if found and existing.status <> 'cancelled' then
    return existing.status;  -- idempotent
  end if;
  if found then
    already_paid := exists (
      select 1 from public.payments p where p.booking_id = existing.id and p.status = 'confirmed');
  end if;

  select count(*) into taken from public.bookings b
  where b.session_id = sid and b.status in ('confirmed', 'pending_payment');

  if taken < s.capacity and not exists (
       select 1 from public.bookings b where b.session_id = sid and b.status = 'waitlisted') then
    if s.fee_npr > 0 and g.payment_mode = 'pay_to_confirm' and not already_paid then
      new_status := 'pending_payment';
    else
      new_status := 'confirmed';
    end if;
  else
    new_status := 'waitlisted';
  end if;

  insert into public.bookings (session_id, user_id, status, queued_at, hold_expires_at)
  values (sid, uid, new_status, now(),
          case when new_status = 'pending_payment' then now() + make_interval(mins => g.hold_minutes) end)
  on conflict (session_id, user_id) do update
    set status = excluded.status, queued_at = excluded.queued_at,
        hold_expires_at = excluded.hold_expires_at,
        cancelled_at = null, late_cancel = false;

  return new_status;
end;
$$;

create or replace function private.cancel_booking(sid uuid)
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
      hold_expires_at = null,
      late_cancel = (b.status = 'confirmed'
                     and now() > s.starts_at - make_interval(hours => s.cancel_cutoff_hours))
  where id = b.id;

  -- A pending claim no longer needs review once the player has left.
  delete from public.payments p where p.booking_id = b.id and p.status <> 'confirmed';

  if b.status in ('confirmed', 'pending_payment') then
    perform private.promote_waitlist(sid);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Payment RPCs
-- ---------------------------------------------------------------------------

-- Player: "I've paid" for their booking in a session.
create function private.claim_payment(sid uuid, pay_method public.payment_method, ref text, proof text)
returns public.payment_status language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  s public.sessions;
  b public.bookings;
  p public.payments;
begin
  if uid is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  select * into s from public.sessions where id = sid for update;
  if not found or not private.is_group_member(s.group_id) then
    raise exception 'Session not found' using errcode = 'P0002';
  end if;
  if s.fee_npr = 0 then
    raise exception 'This session is free';
  end if;

  perform private.release_expired_holds(sid);

  select * into b from public.bookings x where x.session_id = sid and x.user_id = uid;
  if found and b.status = 'waitlisted' then
    raise exception 'You''re on the waitlist. Pay once you get a spot.';
  end if;
  if not found or b.status not in ('confirmed', 'pending_payment') then
    raise exception 'Your hold expired. Book again to get a new spot.';
  end if;
  if pay_method <> 'cash' and char_length(trim(coalesce(ref, ''))) < 4 and proof is null then
    raise exception 'Add the transaction ID or a screenshot so the organizer can find your payment';
  end if;
  if proof is not null and proof not like s.group_id::text || '/' || uid::text || '/%' then
    raise exception 'Invalid screenshot path';
  end if;

  select * into p from public.payments x where x.booking_id = b.id;
  if found and p.status = 'confirmed' then
    raise exception 'This booking is already paid';
  end if;

  insert into public.payments (booking_id, session_id, group_id, user_id, amount_npr, method, status,
                               reference, proof_path, claimed_at)
  values (b.id, sid, s.group_id, uid, s.fee_npr, pay_method, 'claimed', trim(coalesce(ref, '')), proof, now())
  on conflict (booking_id) do update
    set method = excluded.method, status = 'claimed', reference = excluded.reference,
        proof_path = excluded.proof_path, amount_npr = excluded.amount_npr,
        claimed_at = now(), note = '', reviewed_by = null, reviewed_at = null;

  -- Pause the hold while the organizer verifies.
  update public.bookings set hold_expires_at = null where id = b.id;
  return 'claimed';
end;
$$;

-- Organizer: confirm or reject a player's claim.
create function private.review_payment(payment_id uuid, approve boolean, review_note text)
returns public.payment_status language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  p public.payments;
  hold int;
begin
  select * into p from public.payments where id = payment_id;
  if not found or not private.is_group_organizer(p.group_id) then
    raise exception 'Payment not found' using errcode = 'P0002';
  end if;
  perform 1 from public.sessions where id = p.session_id for update;
  if p.status <> 'claimed' then
    raise exception 'This payment was already reviewed';
  end if;

  if approve then
    update public.payments
    set status = 'confirmed', reviewed_by = uid, reviewed_at = now(), note = coalesce(review_note, '')
    where id = p.id;
    update public.bookings set status = 'confirmed', hold_expires_at = null
    where id = p.booking_id and status = 'pending_payment';
    return 'confirmed';
  end if;

  select g.hold_minutes into hold from public.groups g where g.id = p.group_id;
  update public.payments
  set status = 'rejected', reviewed_by = uid, reviewed_at = now(), note = coalesce(review_note, '')
  where id = p.id;
  -- Give the player a fresh window to pay again or fix the transaction ID.
  update public.bookings set hold_expires_at = now() + make_interval(mins => hold)
  where id = p.booking_id and status = 'pending_payment';
  return 'rejected';
end;
$$;

-- Organizer: record a payment taken directly (cash at the court, or a QR they've checked).
create function private.record_payment(sid uuid, player uuid, pay_method public.payment_method, record_note text)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  s public.sessions;
  b public.bookings;
begin
  select * into s from public.sessions where id = sid for update;
  if not found or not private.is_group_organizer(s.group_id) then
    raise exception 'Session not found' using errcode = 'P0002';
  end if;
  select * into b from public.bookings x where x.session_id = sid and x.user_id = player;
  if not found or b.status not in ('confirmed', 'pending_payment') then
    raise exception 'That player has no active booking for this session';
  end if;

  insert into public.payments (booking_id, session_id, group_id, user_id, amount_npr, method, status,
                               note, reviewed_by, reviewed_at)
  values (b.id, sid, s.group_id, player, s.fee_npr, pay_method, 'confirmed',
          coalesce(record_note, ''), uid, now())
  on conflict (booking_id) do update
    set method = excluded.method, status = 'confirmed', amount_npr = excluded.amount_npr,
        note = excluded.note, reviewed_by = uid, reviewed_at = now();

  update public.bookings set status = 'confirmed', hold_expires_at = null
  where id = b.id and status = 'pending_payment';
end;
$$;

-- Organizer: undo a payment recorded by mistake (pay-at-court groups only keep the spot).
create function private.void_payment(payment_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  p public.payments;
  hold int;
begin
  select * into p from public.payments where id = payment_id;
  if not found or not private.is_group_organizer(p.group_id) then
    raise exception 'Payment not found' using errcode = 'P0002';
  end if;
  perform 1 from public.sessions where id = p.session_id for update;
  delete from public.payments where id = p.id;
  if private.requires_prepay(p.session_id) then
    select g.hold_minutes into hold from public.groups g where g.id = p.group_id;
    update public.bookings
    set status = 'pending_payment', hold_expires_at = now() + make_interval(mins => hold)
    where id = p.booking_id and status = 'confirmed';
  end if;
end;
$$;

revoke execute on all functions in schema private from public, anon;
grant execute on function
  private.try_uuid(text), private.claim_payment(uuid, public.payment_method, text, text),
  private.review_payment(uuid, boolean, text),
  private.record_payment(uuid, uuid, public.payment_method, text),
  private.void_payment(uuid)
to authenticated;

create function public.claim_payment(session_id uuid, method public.payment_method, reference text default '', proof_path text default null)
returns public.payment_status language sql security invoker set search_path = ''
as $$ select private.claim_payment(session_id, method, reference, proof_path); $$;

create function public.review_payment(payment_id uuid, approve boolean, note text default '')
returns public.payment_status language sql security invoker set search_path = ''
as $$ select private.review_payment(payment_id, approve, note); $$;

create function public.record_payment(session_id uuid, user_id uuid, method public.payment_method, note text default '')
returns void language sql security invoker set search_path = ''
as $$ select private.record_payment(session_id, user_id, method, note); $$;

create function public.void_payment(payment_id uuid)
returns void language sql security invoker set search_path = ''
as $$ select private.void_payment(payment_id); $$;

revoke execute on function
  public.claim_payment(uuid, public.payment_method, text, text),
  public.review_payment(uuid, boolean, text),
  public.record_payment(uuid, uuid, public.payment_method, text),
  public.void_payment(uuid)
from public, anon;
grant execute on function
  public.claim_payment(uuid, public.payment_method, text, text),
  public.review_payment(uuid, boolean, text),
  public.record_payment(uuid, uuid, public.payment_method, text),
  public.void_payment(uuid)
to authenticated;

-- ---------------------------------------------------------------------------
-- Session overview: held spots count as taken
-- ---------------------------------------------------------------------------
create or replace view public.session_overview with (security_invoker = true) as
select
  s.*,
  g.name as group_name,
  (select count(*) from public.bookings b
    where b.session_id = s.id and b.status = 'confirmed')::int as confirmed_count,
  (select count(*) from public.bookings b
    where b.session_id = s.id and b.status = 'waitlisted')::int as waitlist_count,
  (select b.status from public.bookings b
    where b.session_id = s.id and b.user_id = (select auth.uid())) as my_status,
  (select count(*) from public.bookings b
    where b.session_id = s.id and b.status = 'pending_payment')::int as pending_count,
  g.payment_mode
from public.sessions s
join public.groups g on g.id = s.group_id;

-- ---------------------------------------------------------------------------
-- Storage: organizer QR codes and player payment screenshots (private buckets)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('payment-qr', 'payment-qr', false, 5242880, array['image/png', 'image/jpeg', 'image/webp']),
  ('payment-proofs', 'payment-proofs', false, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

-- payment-qr/<group_id>/<file>: members read, organizers manage.
create policy "payment-qr: members read" on storage.objects
for select to authenticated
using (bucket_id = 'payment-qr'
       and (select private.is_group_member(private.try_uuid((storage.foldername(name))[1]))));

create policy "payment-qr: organizers upload" on storage.objects
for insert to authenticated
with check (bucket_id = 'payment-qr'
            and (select private.is_group_organizer(private.try_uuid((storage.foldername(name))[1]))));

create policy "payment-qr: organizers replace" on storage.objects
for update to authenticated
using (bucket_id = 'payment-qr'
       and (select private.is_group_organizer(private.try_uuid((storage.foldername(name))[1]))))
with check (bucket_id = 'payment-qr'
            and (select private.is_group_organizer(private.try_uuid((storage.foldername(name))[1]))));

create policy "payment-qr: organizers delete" on storage.objects
for delete to authenticated
using (bucket_id = 'payment-qr'
       and (select private.is_group_organizer(private.try_uuid((storage.foldername(name))[1]))));

-- payment-proofs/<group_id>/<user_id>/<file>: the player uploads; player + organizers read.
create policy "payment-proofs: player uploads" on storage.objects
for insert to authenticated
with check (bucket_id = 'payment-proofs'
            and (storage.foldername(name))[2] = (select auth.uid())::text
            and (select private.is_group_member(private.try_uuid((storage.foldername(name))[1]))));

create policy "payment-proofs: player or organizer reads" on storage.objects
for select to authenticated
using (bucket_id = 'payment-proofs'
       and ((storage.foldername(name))[2] = (select auth.uid())::text
            or (select private.is_group_organizer(private.try_uuid((storage.foldername(name))[1])))));

-- ---------------------------------------------------------------------------
-- Release expired holds every minute
-- ---------------------------------------------------------------------------
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
select cron.schedule('openplay-expire-payment-holds', '* * * * *', 'select private.expire_holds()');
