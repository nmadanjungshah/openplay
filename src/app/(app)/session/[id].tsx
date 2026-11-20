import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Platform, View } from 'react-native';

import { bookingBadge } from '@/components/session-card';
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBanner,
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
import type { BookingStatus, Profile, SessionOverview } from '@/lib/types';

type Player = {
  id: string;
  user_id: string;
  status: BookingStatus;
  queued_at: string;
  late_cancel: boolean;
  profiles: Pick<Profile, 'full_name' | 'skill_level'> | null;
};

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
    const [players, membership] = await Promise.all([
      supabase
        .from('bookings')
        .select('id, user_id, status, queued_at, late_cancel, profiles(full_name, skill_level)')
        .eq('session_id', id)
        .neq('status', 'cancelled')
        .order('queued_at'),
      supabase.from('group_members').select('role').eq('group_id', s.group_id!).eq('user_id', uid).maybeSingle(),
    ]);
    return {
      s,
      players: unwrap(players) as Player[],
      isOrganizer: (unwrap(membership) as { role: string } | null)?.role === 'organizer',
    };
  }, `session-${id}`);

  // Live updates: seats and waitlist move as other players book or cancel.
  useEffect(() => {
    const channel = supabase
      .channel(`session-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings', filter: `session_id=eq.${id}` }, () =>
        q.refetch(true),
      )
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'sessions', filter: `id=eq.${id}` }, () =>
        q.refetch(true),
      )
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

  const { s, players, isOrganizer } = q.data;
  const confirmed = players.filter((p) => p.status === 'confirmed');
  const waitlist = players.filter((p) => p.status === 'waitlisted');
  const myWaitPos = waitlist.findIndex((p) => p.user_id === uid) + 1;
  const capacity = s.capacity ?? 0;
  const spotsLeft = Math.max(0, capacity - confirmed.length);
  const started = new Date(s.starts_at!).getTime() <= now;
  const cancelled = s.status === 'cancelled';
  const cutoffAt = new Date(s.starts_at!).getTime() - (s.cancel_cutoff_hours ?? 0) * 3600_000;
  const insideCutoff = now > cutoffAt;
  const skills = skillRange(s.skill_min, s.skill_max);

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
    const message = late
      ? `It's within ${s.cancel_cutoff_hours}h of start, so this counts as a late cancellation.`
      : s.my_status === 'waitlisted'
        ? 'You’ll lose your place on the waitlist.'
        : 'Your spot goes to the next person on the waitlist.';
    if (!(await confirm(s.my_status === 'waitlisted' ? 'Leave waitlist?' : 'Cancel booking?', message, 'Yes, cancel'))) return;
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
    if (!(await confirm('Delete session?', 'This removes the session and all its bookings.', 'Delete'))) return;
    setBusy(true);
    const { error } = await supabase.from('sessions').delete().eq('id', s.id!);
    setBusy(false);
    if (error) setActionError(errorMessage(error));
    else router.back();
  }

  let primary: ReactNode = null;
  if (cancelled) {
    primary = <Txt tone="danger" style={{ textAlign: 'center' }}>This session was cancelled by the organizer.</Txt>;
  } else if (started) {
    primary = <Txt tone="textSecondary" style={{ textAlign: 'center' }}>This session has started.</Txt>;
  } else if (s.my_status === 'confirmed' || s.my_status === 'waitlisted') {
    primary = (
      <Button
        title={s.my_status === 'confirmed' ? 'Cancel my spot' : 'Leave waitlist'}
        variant="danger"
        onPress={cancelMine}
        loading={busy}
      />
    );
  } else {
    primary = (
      <Button
        title={spotsLeft > 0 ? `Book my spot · ${formatNpr(s.fee_npr ?? 0)}` : `Join waitlist (${waitlist.length} waiting)`}
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
          <Badge label={`${confirmed.length}/${capacity} players`} tone={spotsLeft === 0 ? 'danger' : 'neutral'} />
          <Badge label={`${s.courts} court${s.courts === 1 ? '' : 's'}`} />
          <Badge label={formatNpr(s.fee_npr ?? 0)} />
          {skills ? <Badge label={`Level ${skills}`} /> : null}
          <Badge label={`Cancel ${s.cancel_cutoff_hours}h before`} />
        </Row>
        {s.my_status === 'waitlisted' && myWaitPos > 0 ? (
          <Card style={{ borderWidth: 0 }}>
            <Txt variant="bodyBold">You&apos;re #{myWaitPos} on the waitlist</Txt>
            <Txt variant="small" tone="textSecondary">
              You&apos;ll be moved in automatically if a spot opens.
            </Txt>
          </Card>
        ) : null}
        {s.notes ? <Txt>{s.notes}</Txt> : null}
      </View>

      {actionError ? <ErrorBanner message={actionError} /> : null}
      {q.error ? <ErrorBanner message={q.error} onRetry={() => q.refetch()} /> : null}

      <Row wrap>
        <Button title="Google Calendar" icon="calendar-outline" variant="secondary" small onPress={() => openGoogleCalendar(event)} />
        {Platform.OS === 'web' ? (
          <Button title="Download .ics" icon="download-outline" variant="secondary" small onPress={() => downloadIcs(event)} />
        ) : null}
      </Row>

      <Section title={`Playing · ${confirmed.length}`}>
        {confirmed.length ? (
          <Card>
            {confirmed.map((p) => (
              <PlayerRow key={p.id} player={p} me={p.user_id === uid} />
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
              min={Math.max(1, confirmed.length)}
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
              <Button title="Delete" variant="ghost" small onPress={deleteSession} disabled={busy} />
            </Row>
          </Card>
        </Section>
      ) : null}
    </Screen>
  );
}

function PlayerRow({ player, me, position }: { player: Player; me: boolean; position?: number }) {
  const name = player.profiles?.full_name || 'Unnamed player';
  return (
    <Row style={{ paddingVertical: 4 }}>
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
    </Row>
  );
}
