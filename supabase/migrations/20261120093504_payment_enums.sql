-- M2 payments, part 1: enum changes.
-- Kept in their own migration because a newly added enum value can't be used
-- in the same transaction it was created in.

-- A spot that is held while the player pays (only in "pay to confirm" groups).
alter type public.booking_status add value if not exists 'pending_payment';

create type public.payment_mode as enum ('pay_at_court', 'pay_to_confirm');
create type public.payment_method as enum ('cash', 'esewa', 'khalti', 'other');
-- claimed: the player says they paid; confirmed: the organizer verified it; rejected: not found.
create type public.payment_status as enum ('claimed', 'confirmed', 'rejected');
