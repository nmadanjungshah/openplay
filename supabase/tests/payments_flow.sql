-- Payments integration test (M2). Run: npm run test:db. Rolled back at the end.
begin;

insert into auth.users (id, email, raw_user_meta_data, aud, role) values
  ('00000000-0000-0000-0000-0000000000a1', 'org@test.np', '{"full_name":"Org"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000b1', 'asha@test.np', '{"full_name":"Asha"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000c1', 'bikash@test.np', '{"full_name":"Bikash"}', 'authenticated', 'authenticated');

create schema tests;
create function tests.act_as(uid text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;
create function tests.check(ok boolean, label text) returns void language plpgsql as $$
begin
  if ok is not true then raise exception 'FAIL: %', label; end if;
  raise notice 'ok: %', label;
end $$;
create function tests.booking(uid text) returns public.bookings language sql security definer as $$
  select * from public.bookings where user_id = uid::uuid and session_id = '20000000-0000-0000-0000-0000000000f1';
$$;
grant usage on schema tests to authenticated;
grant execute on all functions in schema tests to authenticated;

set local role authenticated;

-- Organizer: pay-to-confirm group, Rs 500 session with ONE spot.
select tests.act_as('00000000-0000-0000-0000-0000000000a1');
insert into public.groups (id, name, invite_code, payment_mode, hold_minutes, esewa_id)
values ('10000000-0000-0000-0000-0000000000f1', 'Prepay Club', 'PAY001', 'pay_to_confirm', 15, '9800000000');
insert into public.sessions (id, group_id, title, starts_at, ends_at, capacity, fee_npr)
values ('20000000-0000-0000-0000-0000000000f1', '10000000-0000-0000-0000-0000000000f1', 'Paid play',
        now() + interval '2 days', now() + interval '2 days 2 hours', 1, 500);

select tests.act_as('00000000-0000-0000-0000-0000000000b1');
select public.join_group('PAY001');
select tests.act_as('00000000-0000-0000-0000-0000000000c1');
select public.join_group('PAY001');

-- Asha books -> held, not confirmed.
select tests.act_as('00000000-0000-0000-0000-0000000000b1');
select tests.check(public.book_session('20000000-0000-0000-0000-0000000000f1') = 'pending_payment', 'prepay booking is held');
select tests.check((tests.booking('00000000-0000-0000-0000-0000000000b1')).hold_expires_at > now() + interval '14 minutes', 'hold lasts hold_minutes');

-- Bikash books -> waitlisted because the held spot counts as taken.
select tests.act_as('00000000-0000-0000-0000-0000000000c1');
select tests.check(public.book_session('20000000-0000-0000-0000-0000000000f1') = 'waitlisted', 'held spot counts toward capacity');
select tests.check((select pending_count = 1 and confirmed_count = 0 from public.session_overview
  where id = '20000000-0000-0000-0000-0000000000f1'), 'overview shows 1 pending');

-- Bikash can't claim a payment for a booking he doesn't hold.
do $$ begin
  perform public.claim_payment('20000000-0000-0000-0000-0000000000f1', 'esewa', 'ABC12345');
  raise exception 'FAIL: waitlisted player claimed';
exception when raise_exception then
  if sqlerrm like 'FAIL%' then raise; end if;
  raise notice 'ok: waitlisted player cannot claim (%)', sqlerrm;
end $$;

-- Asha claims without a reference -> rejected by validation.
select tests.act_as('00000000-0000-0000-0000-0000000000b1');
do $$ begin
  perform public.claim_payment('20000000-0000-0000-0000-0000000000f1', 'esewa', '');
  raise exception 'FAIL: claim without reference';
exception when raise_exception then
  if sqlerrm like 'FAIL%' then raise; end if;
  raise notice 'ok: claim needs a reference or screenshot';
end $$;

-- Asha claims properly -> hold paused.
select tests.check(public.claim_payment('20000000-0000-0000-0000-0000000000f1', 'esewa', '0ABC1234XY') = 'claimed', 'Asha claims eSewa payment');
select tests.check((tests.booking('00000000-0000-0000-0000-0000000000b1')).hold_expires_at is null, 'claim pauses the hold');

-- Other players can't see Asha's payment; the organizer can.
select tests.act_as('00000000-0000-0000-0000-0000000000c1');
select tests.check((select count(*) = 0 from public.payments), 'other players cannot see payments');
select tests.act_as('00000000-0000-0000-0000-0000000000a1');
select tests.check((select count(*) = 1 from public.payments where status = 'claimed'), 'organizer sees the claim');

-- Organizer rejects -> fresh hold, still pending.
select tests.check(public.review_payment((select id from public.payments limit 1), false, 'Not found in eSewa') = 'rejected', 'organizer rejects');
select tests.check((tests.booking('00000000-0000-0000-0000-0000000000b1')).status = 'pending_payment'
  and (tests.booking('00000000-0000-0000-0000-0000000000b1')).hold_expires_at > now(), 'reject restarts the hold');

-- Asha resubmits, organizer confirms -> booking confirmed.
select tests.act_as('00000000-0000-0000-0000-0000000000b1');
select public.claim_payment('20000000-0000-0000-0000-0000000000f1', 'khalti', 'KH-998877');
select tests.act_as('00000000-0000-0000-0000-0000000000a1');
select tests.check(public.review_payment((select id from public.payments limit 1), true) = 'confirmed', 'organizer confirms');
select tests.check((tests.booking('00000000-0000-0000-0000-0000000000b1')).status = 'confirmed', 'confirmed payment confirms booking');

-- Members can't review payments.
select tests.act_as('00000000-0000-0000-0000-0000000000c1');
do $$ begin
  perform public.review_payment((select id from public.payments limit 1), true);
  raise exception 'FAIL: member reviewed payment';
exception when sqlstate 'PT404' then raise notice 'ok: members cannot review payments';
end $$;

-- Asha cancels -> Bikash promoted into a HOLD (prepay), and Asha's confirmed payment is kept.
select tests.act_as('00000000-0000-0000-0000-0000000000b1');
select public.cancel_booking('20000000-0000-0000-0000-0000000000f1');
select tests.check((tests.booking('00000000-0000-0000-0000-0000000000c1')).status = 'pending_payment', 'promoted player gets a hold, not a free spot');
select tests.check((select count(*) = 1 from public.payments where status = 'confirmed'), 'cancelled player keeps confirmed payment (for refund/credit)');

-- Bikash's hold expires unclaimed -> released by the cron function; Asha rebooks.
reset role;
update public.bookings set hold_expires_at = now() - interval '1 minute'
where user_id = '00000000-0000-0000-0000-0000000000c1';
-- The cron job may have already run; either way this hold must be released.
select private.expire_holds();
select tests.check((tests.booking('00000000-0000-0000-0000-0000000000c1')).status = 'cancelled', 'expired hold is cancelled');
set local role authenticated;

-- Asha rebooks: she already paid for this booking, so she's confirmed straight away.
select tests.act_as('00000000-0000-0000-0000-0000000000b1');
select tests.check(public.book_session('20000000-0000-0000-0000-0000000000f1') = 'confirmed', 'already-paid player rebooks straight to confirmed');

-- Pay-at-court: booking confirms immediately; organizer records cash; can void it.
select tests.act_as('00000000-0000-0000-0000-0000000000a1');
update public.groups set payment_mode = 'pay_at_court' where id = '10000000-0000-0000-0000-0000000000f1';
update public.sessions set capacity = 2 where id = '20000000-0000-0000-0000-0000000000f1';
select tests.act_as('00000000-0000-0000-0000-0000000000c1');
select tests.check(public.book_session('20000000-0000-0000-0000-0000000000f1') = 'confirmed', 'pay-at-court booking confirms immediately');
select tests.act_as('00000000-0000-0000-0000-0000000000a1');
select public.record_payment('20000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000c1', 'cash', 'paid at court');
select tests.check((select count(*) = 2 from public.payments where status = 'confirmed'), 'organizer recorded cash');
select public.void_payment((select id from public.payments where user_id = '00000000-0000-0000-0000-0000000000c1'));
select tests.check((select count(*) = 1 from public.payments), 'organizer voided a mistaken payment');
select tests.check((tests.booking('00000000-0000-0000-0000-0000000000c1')).status = 'confirmed', 'voiding in pay-at-court keeps the spot');

-- Members can't record payments.
select tests.act_as('00000000-0000-0000-0000-0000000000c1');
do $$ begin
  perform public.record_payment('20000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000c1', 'cash');
  raise exception 'FAIL: member recorded payment';
exception when sqlstate 'PT404' then raise notice 'ok: members cannot record payments';
end $$;

-- Members can't change payment settings... (organizer-only via RLS on groups)
update public.groups set payment_mode = 'pay_to_confirm' where id = '10000000-0000-0000-0000-0000000000f1';
select tests.act_as('00000000-0000-0000-0000-0000000000a1');
select tests.check((select payment_mode = 'pay_at_court' from public.groups
  where id = '10000000-0000-0000-0000-0000000000f1'), 'member cannot change payment settings');

rollback;
