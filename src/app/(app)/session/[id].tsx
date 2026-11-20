import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Platform, View } from 'react-native';

import { PaymentCard, type PayInfo } from '@/components/payment-card';
import { PrivateImage } from '@/components/private-image';
import { bookingBadge } from '@/components/session-card';
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Field,
  IconText,
  Loading,
  Row,
  Screen,
  Section,
  Stepper,
  Txt,
} from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useNow } from '@/hooks/use-now';
import { unwrap, useQuery } from '@/hooks/use-query';
import { useAuth } from '@/lib/auth';
import { downloadIcs, openGoogleCalendar, type CalendarEvent } from '@/lib/calendar';
import { formatNpr, formatSlot, skillRange } from '@/lib/format';
import { confirm, notify } from '@/lib/share';
import { errorMessage, supabase } from '@/lib/supabase';
import { goBackOr } from '@/lib/nav';
import {
  METHOD_LABEL,
  type BookingStatus,
  type Payment,
  type PaymentMethod,
  type Profile,
  type SessionOverview,
} from '@/lib/types';

type PlayerPayment = Pick<Payment, 'id' | 'status' | 'method' | 'reference' | 'proof_path' | 'note' | 'amount_npr'>;

type Player = {
  id: string;
  user_id: string;
  status: BookingStatus;
  queued_at: string;
  late_cancel: boolean;
  hold_expires_at: string | null;
  profiles: Pick<Profile, 'full_name' | 'skill_level'> | null;
  /** Only visible to the player themselves and to organizers (RLS). */
  payments: PlayerPayment | null;
};

const PLAYER_COLUMNS =
  'id, user_id, status, queued_at, late_cancel, hold_expires_at, profiles(full_name, skill_level), payments(id, status, method, reference, proof_path, note, amount_npr)';

export default function SessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session: auth } = useAuth();
  const uid = auth!.user.id;
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const now = useNow();

  const q = useQuery(async () => {
    const s = unwrap(await supabase.from('session_overview').select('*').eq('id', id).maybeSingle()) as SessionOverview | null;
    if (!s) return null;
    const [players, membership, group] = await Promise.all([
      supabase.from('bookings').select(PLAYER_COLUMNS).eq('session_id', id).neq('status', 'cancelled').order('queued_at'),
      supabase.from('group_members').select('role').eq('group_id', s.group_id!).eq('user_id', uid).maybeSingle(),
      supabase
        .from('groups')
        .select('id, payment_mode, esewa_id, khalti_id, esewa_qr_path, khalti_qr_path, payment_note')
        .eq('id', s.group_id!)
        .single(),
    ]);
    return {
      s,
      players: unwrap(players) as unknown as Player[],
      isOrganizer: (unwrap(membership) as { role: string } | null)?.role === 'organizer',
      group: unwrap(group) as PayInfo,
    };
  }, `session-${id}`);

  // Live updates: seats, waitlist and payment reviews move without reloading.
  useEffect(() => {
    const refresh = () => q.refetch(true);
    const channel = supabase
      .channel(`session-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings', filter: `session_id=eq.${id}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments', filter: `session_id=eq.${id}` }, refresh)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'sessions', filter: `id=eq.${id}` }, refresh)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (q.loading) {
    return (
      <Screen hasHeader>
        <Loading />
      </Screen>
    );
  }
  if (!q.data) {
    return (
      <Screen hasHeader>
        {q.error ? <ErrorBanner message={q.error} onRetry={() => q.refetch()} /> : null}
        <EmptyState icon="calendar-outline" title="Session not found" message="It may have been deleted, or you're not in this group." />
      </Screen>
    );
  }

  const { s, players, isOrganizer, group } = q.data;
  const fee = s.fee_npr ?? 0;
  const playing = players.filter((p) => p.status === 'confirmed' || p.status === 'pending_payment');
  const waitlist = players.filter((p) => p.status === 'waitlisted');
  const me = players.find((p) => p.user_id === uid);
  const myWaitPos = waitlist.findIndex((p) => p.user_id === uid) + 1;
  const capacity = s.capacity ?? 0;
  const spotsLeft = Math.max(0, capacity - playing.length);
  const started = new Date(s.starts_at!).getTime() <= now;
  const cancelled = s.status === 'cancelled';
  const cutoffAt = new Date(s.starts_at!).getTime() - (s.cancel_cutoff_hours ?? 0) * 3600_000;
  const insideCutoff = now > cutoffAt;
  const skills = skillRange(s.skill_min, s.skill_max);
  const prepay = fee > 0 && s.payment_mode === 'pay_to_confirm';
  const toVerify = isOrganizer ? players.filter((p) => p.payments?.status === 'claimed') : [];
  const paidCount = players.filter((p) => p.payments?.status === 'confirmed' && p.status !== 'waitlisted').length;

  const event: CalendarEvent = {
    id: s.id!,
    title: `${s.title} · ${s.group_name}`,
    startsAt: s.starts_at!,
    endsAt: s.ends_at!,
    location: s.location ?? '',
    details: [s.notes, 'Booked with OpenPlay'].filter(Boolean).join('\n\n'),
  };

  async function run(action: () => PromiseLike<{ error: unknown }>) {
    setBusy(true);
    setActionError(null);
    const { error } = await action();
    setBusy(false);
    if (error) setActionError(errorMessage(error));
    await q.refetch(true);
  }

  async function book() {
    setBusy(true);
    setActionError(null);
    const { data, error } = await supabase.rpc('book_session', { session_id: s.id! });
    setBusy(false);
    if (error) setActionError(errorMessage(error));
    else if (data === 'waitlisted') notify("You're on the waitlist", "We'll move you up automatically if a spot opens.");
    await q.refetch(true);
  }

  async function cancelMine() {
    const late = s.my_status === 'confirmed' && insideCutoff;
    const paid = me?.payments?.status === 'confirmed';
    const message = late
      ? `It's within ${s.cancel_cutoff_hours}h of start, so this counts as a late cancellation.`
      : s.my_status === 'waitlisted'
        ? 'You’ll lose your place on the waitlist.'
        : s.my_status === 'pending_payment'
          ? 'Your held spot goes to the next person.'
          : 'Your spot goes to the next person on the waitlist.';
    const refundNote = paid ? '\n\nYou already paid: ask the organizer about a refund or credit.' : '';
    const title = s.my_status === 'waitlisted' ? 'Leave waitlist?' : s.my_status === 'pending_payment' ? 'Release spot?' : 'Cancel booking?';
    if (!(await confirm(title, message + refundNote, 'Yes, cancel'))) return;
    await run(() => supabase.rpc('cancel_booking', { session_id: s.id! }));
  }

  async function setCapacity(next: number) {
    await run(() => supabase.from('sessions').update({ capacity: next }).eq('id', s.id!));
  }

  async function toggleSessionStatus() {
    if (!cancelled) {
      const ok = await confirm('Cancel this session?', 'Players will see it as cancelled. You can reinstate it later.', 'Cancel session');
      if (!ok) return;
    }
    await run(() =>
      supabase.from('sessions').update({ status: cancelled ? 'scheduled' : 'cancelled' }).eq('id', s.id!),
    );
  }

  async function deleteSession() {
    if (!(await confirm('Delete session?', 'This removes the session, its bookings and payment records.', 'Delete'))) return;
    setBusy(true);
    const { error } = await supabase.from('sessions').delete().eq('id', s.id!);
    setBusy(false);
    if (error) setActionError(errorMessage(error));
    else goBackOr({ pathname: '/group/[id]', params: { id: s.group_id! } });
  }

  let primary: ReactNode = null;
  if (cancelled) {
    primary = <Txt tone="danger" style={{ textAlign: 'center' }}>This session was cancelled by the organizer.</Txt>;
  } else if (started) {
    primary = <Txt tone="textSecondary" style={{ textAlign: 'center' }}>This session has started.</Txt>;
  } else if (s.my_status === 'confirmed' || s.my_status === 'waitlisted' || s.my_status === 'pending_payment') {
    primary = (
      <Button
        title={
          s.my_status === 'confirmed' ? 'Cancel my spot' : s.my_status === 'pending_payment' ? 'Release held spot' : 'Leave waitlist'
        }
        variant="danger"
        onPress={cancelMine}
        loading={busy}
      />
    );
  } else {
    primary = (
      <Button
        title={
          spotsLeft > 0
            ? prepay
              ? `Hold my spot · pay ${formatNpr(fee)}`
              : `Book my spot · ${formatNpr(fee)}`
            : `Join waitlist (${waitlist.length} waiting)`
        }
        icon={spotsLeft > 0 ? 'checkmark-circle-outline' : 'time-outline'}
        onPress={book}
        loading={busy}
      />
    );
  }

  return (
    <Screen hasHeader refreshing={q.refreshing} onRefresh={() => q.refetch()} footer={primary}>
      <Stack.Screen options={{ title: s.title ?? 'Session' }} />

      <View style={{ gap: Spacing.two }}>
        <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Txt variant="title">{s.title}</Txt>
            <Txt
              tone="primary"
              variant="bodyBold"
              onPress={() => router.push({ pathname: '/group/[id]', params: { id: s.group_id! } })}>
              {s.group_name}
            </Txt>
          </View>
          {bookingBadge(s)}
        </Row>
        <IconText icon="calendar-outline" tone="text">
          {formatSlot(s.starts_at!, s.ends_at!)}
        </IconText>
        {s.location ? (
          <IconText icon="location-outline" tone="text">
            {s.location}
          </IconText>
        ) : null}
        <Row wrap gap={6}>
          <Badge label={`${playing.length}/${capacity} players`} tone={spotsLeft === 0 ? 'danger' : 'neutral'} />
          <Badge label={`${s.courts} court${s.courts === 1 ? '' : 's'}`} />
          <Badge label={formatNpr(fee)} />
          {prepay ? <Badge label="Pay to confirm" tone="accent" /> : null}
          {skills ? <Badge label={`Level ${skills}`} /> : null}
          <Badge label={`Cancel ${s.cancel_cutoff_hours}h before`} />
        </Row>
        {s.my_status === 'waitlisted' && myWaitPos > 0 ? (
          <Card style={{ borderWidth: 0 }}>
            <Txt variant="bodyBold">You&apos;re #{myWaitPos} on the waitlist</Txt>
            <Txt variant="small" tone="textSecondary">
              {prepay
                ? 'If a spot opens, it’s held for you and you’ll have a few minutes to pay.'
                : 'You’ll be moved in automatically if a spot opens.'}
            </Txt>
          </Card>
        ) : null}
        {s.notes ? <Txt>{s.notes}</Txt> : null}
      </View>

      {actionError ? <ErrorBanner message={actionError} /> : null}
      {q.error ? <ErrorBanner message={q.error} onRetry={() => q.refetch()} /> : null}

      {me && !cancelled ? (
        <PaymentCard
          sessionId={s.id!}
          fee={fee}
          status={me.status}
          holdExpiresAt={me.hold_expires_at}
          payment={me.payments}
          group={group}
          userId={uid}
          onChanged={() => q.refetch(true)}
        />
      ) : null}

      {toVerify.length ? (
        <Card style={{ borderWidth: 0 }}>
          <Txt variant="bodyBold">
            {toVerify.length} payment{toVerify.length === 1 ? '' : 's'} to verify
          </Txt>
          <Txt variant="small" tone="textSecondary">
            Check your eSewa/Khalti statement for each transaction ID below, then confirm or reject.
          </Txt>
        </Card>
      ) : null}

      <Row wrap>
        <Button title="Google Calendar" icon="calendar-outline" variant="secondary" small onPress={() => openGoogleCalendar(event)} />
        {Platform.OS === 'web' ? (
          <Button title="Download .ics" icon="download-outline" variant="secondary" small onPress={() => downloadIcs(event)} />
        ) : null}
      </Row>

      <Section title={`Playing · ${playing.length}${isOrganizer && fee > 0 ? ` · ${paidCount} paid` : ''}`}>
        {playing.length ? (
          <Card>
            {playing.map((p) => (
              <PlayerRow
                key={p.id}
                player={p}
                me={p.user_id === uid}
                isOrganizer={isOrganizer}
                fee={fee}
                sessionId={s.id!}
                onChanged={() => q.refetch(true)}
              />
            ))}
          </Card>
        ) : (
          <EmptyState icon="tennisball-outline" title="No one yet" message="Be the first to book a spot." />
        )}
      </Section>

      {waitlist.length ? (
        <Section title={`Waitlist · ${waitlist.length}`}>
          <Card>
            {waitlist.map((p, i) => (
              <PlayerRow key={p.id} player={p} me={p.user_id === uid} position={i + 1} />
            ))}
          </Card>
        </Section>
      ) : null}

      {isOrganizer ? (
        <Section title="Organizer">
          <Card>
            <Stepper
              label="Max players"
              value={capacity}
              min={Math.max(1, playing.length)}
              max={200}
              onChange={setCapacity}
            />
            <Txt variant="small" tone="textSecondary">
              Raising the limit moves waitlisted players in automatically.
            </Txt>
            <Row wrap>
              <Button
                title={cancelled ? 'Reinstate session' : 'Cancel session'}
                variant={cancelled ? 'secondary' : 'danger'}
                small
                onPress={toggleSessionStatus}
                disabled={busy}
              />
              <Button title="Delete session" variant="danger" icon="trash-outline" small onPress={deleteSession} disabled={busy} />
            </Row>
          </Card>
        </Section>
      ) : null}
    </Screen>
  );
}

function paymentBadge(p: Player, fee: number) {
  if (fee <= 0) return null;
  if (p.status === 'pending_payment' && p.payments?.status !== 'claimed') return <Badge label="Holding" tone="warning" />;
  switch (p.payments?.status) {
    case 'confirmed':
      return <Badge label={`Paid · ${METHOD_LABEL[p.payments.method]}`} tone="success" />;
    case 'claimed':
      return <Badge label="To verify" tone="warning" />;
    case 'rejected':
      return <Badge label="Rejected" tone="danger" />;
    default:
      return <Badge label="Unpaid" />;
  }
}

function PlayerRow({
  player,
  me,
  position,
  isOrganizer,
  fee = 0,
  sessionId,
  onChanged,
}: {
  player: Player;
  me: boolean;
  position?: number;
  isOrganizer?: boolean;
  fee?: number;
  sessionId?: string;
  onChanged?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = player.profiles?.full_name || 'Unnamed player';
  const pay = player.payments;
  const canManage = isOrganizer && fee > 0 && !position;
  const showBadge = fee > 0 && !position && (isOrganizer || me);

  async function act(fn: () => PromiseLike<{ error: unknown }>) {
    setBusy(true);
    setError(null);
    const { error } = await fn();
    setBusy(false);
    if (error) setError(errorMessage(error));
    else {
      setOpen(false);
      setNote('');
      onChanged?.();
    }
  }

  const review = (approve: boolean) =>
    act(() => supabase.rpc('review_payment', { payment_id: pay!.id, approve, note: note.trim() }));
  const record = (method: PaymentMethod) =>
    act(() => supabase.rpc('record_payment', { session_id: sessionId!, user_id: player.user_id, method, note: note.trim() }));
  const voidPayment = async () => {
    if (!(await confirm('Undo payment?', `Mark ${name} as unpaid again?`, 'Undo'))) return;
    await act(() => supabase.rpc('void_payment', { payment_id: pay!.id }));
  };

  return (
    <View style={{ paddingVertical: 4, gap: Spacing.two }}>
      <Row>
        {position ? (
          <Txt variant="bodyBold" tone="textSecondary" style={{ width: 24, textAlign: 'center' }}>
            {position}
          </Txt>
        ) : null}
        <Avatar name={name} />
        <View style={{ flex: 1 }}>
          <Txt variant="bodyBold">
            {name}
            {me ? ' (you)' : ''}
          </Txt>
          <Txt variant="small" tone="textSecondary">
            {player.profiles?.skill_level != null ? `Level ${player.profiles.skill_level.toFixed(1)}` : 'Level not set'}
          </Txt>
        </View>
        {showBadge ? paymentBadge(player, fee) : null}
        {canManage ? (
          <Button
            title={open ? 'Close' : pay?.status === 'claimed' ? 'Review' : 'Payment'}
            variant={pay?.status === 'claimed' ? 'primary' : 'ghost'}
            small
            onPress={() => setOpen(!open)}
          />
        ) : null}
      </Row>

      {canManage && open ? (
        <Card style={{ borderWidth: 0 }}>
          {pay?.status === 'claimed' ? (
            <>
              <Txt variant="bodyBold">
                Says they paid {formatNpr(pay.amount_npr)} by {METHOD_LABEL[pay.method]}
              </Txt>
              {pay.reference ? (
                <Txt selectable>
                  Transaction ID: <Txt variant="bodyBold">{pay.reference}</Txt>
                </Txt>
              ) : null}
              {pay.proof_path ? (
                <PrivateImage bucket="payment-proofs" path={pay.proof_path} size={200} openOnPress label="Payment screenshot" />
              ) : null}
              <Field label="Note (shown to player if rejected)" value={note} onChangeText={setNote} maxLength={300} />
              <Row wrap>
                <Button title="Confirm paid" icon="checkmark" small onPress={() => review(true)} loading={busy} />
                <Button title="Reject" variant="danger" small onPress={() => review(false)} disabled={busy} />
              </Row>
            </>
          ) : pay?.status === 'confirmed' ? (
            <>
              <Txt>
                Paid {formatNpr(pay.amount_npr)} by {METHOD_LABEL[pay.method]}
                {pay.reference ? ` (ref ${pay.reference})` : ''}
                {pay.note ? ` · ${pay.note}` : ''}
              </Txt>
              <Button title="Undo payment" variant="ghost" small onPress={voidPayment} loading={busy} />
            </>
          ) : (
            <>
              <Txt variant="small" tone="textSecondary">
                Record a payment you&apos;ve received for {formatNpr(fee)}:
              </Txt>
              <Row wrap>
                {(['cash', 'esewa', 'khalti'] as const).map((m) => (
                  <Button key={m} title={`Paid · ${METHOD_LABEL[m]}`} variant="secondary" small onPress={() => record(m)} disabled={busy} />
                ))}
              </Row>
            </>
          )}
          {error ? <ErrorBanner message={error} /> : null}
        </Card>
      ) : null}
    </View>
  );
}
