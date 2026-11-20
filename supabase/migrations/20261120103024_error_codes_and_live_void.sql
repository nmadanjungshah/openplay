-- Return proper HTTP statuses for expected errors and make 'undo payment' visible live.
--
-- * 'not found' errors used SQLSTATE P0002, which PostgREST maps to HTTP 500.
--   PT404 makes PostgREST answer 404, so wrong invite codes etc. are not logged as server errors.
-- * void_payment deletes a row; Realtime can't filter DELETE events under RLS, so the player
--   never heard about it. It now also touches the booking row, which players do receive.

create or replace function private.join_group(code text)
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
    raise exception 'No group found for that invite code' using errcode = 'PT404';
  end if;
  insert into public.group_members (group_id, user_id, role)
  values (gid, uid, 'member')
  on conflict do nothing;
  return gid;
end;
$$;

create or replace function private.join_public_group(gid uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  if not exists (select 1 from public.groups g where g.id = gid and g.is_public) then
    raise exception 'Group not found' using errcode = 'PT404';
  end if;
  insert into public.group_members (group_id, user_id, role)
  values (gid, uid, 'member')
  on conflict do nothing;
end;
$$;

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
    raise exception 'Session not found' using errcode = 'PT404';
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
    raise exception 'Session not found' using errcode = 'PT404';
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

create or replace function private.claim_payment(sid uuid, pay_method public.payment_method, ref text, proof text)
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
    raise exception 'Session not found' using errcode = 'PT404';
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

create or replace function private.review_payment(payment_id uuid, approve boolean, review_note text)
returns public.payment_status language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  p public.payments;
  hold int;
begin
  select * into p from public.payments where id = payment_id;
  if not found or not private.is_group_organizer(p.group_id) then
    raise exception 'Payment not found' using errcode = 'PT404';
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

create or replace function private.record_payment(sid uuid, player uuid, pay_method public.payment_method, record_note text)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  s public.sessions;
  b public.bookings;
begin
  select * into s from public.sessions where id = sid for update;
  if not found or not private.is_group_organizer(s.group_id) then
    raise exception 'Session not found' using errcode = 'PT404';
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

create or replace function private.void_payment(payment_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  p public.payments;
  hold int;
begin
  select * into p from public.payments where id = payment_id;
  if not found or not private.is_group_organizer(p.group_id) then
    raise exception 'Payment not found' using errcode = 'PT404';
  end if;
  perform 1 from public.sessions where id = p.session_id for update;
  delete from public.payments where id = p.id;
  -- Touch the booking so subscribed players refresh (DELETE events aren't delivered under RLS).
  update public.bookings set queued_at = queued_at where id = p.booking_id;
  if private.requires_prepay(p.session_id) then
    select g.hold_minutes into hold from public.groups g where g.id = p.group_id;
    update public.bookings
    set status = 'pending_payment', hold_expires_at = now() + make_interval(mins => hold)
    where id = p.booking_id and status = 'confirmed';
  end if;
end;
$$;
