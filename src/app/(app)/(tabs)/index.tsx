import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { SessionCard } from '@/components/session-card';
import { Button, Card, Chip, EmptyState, ErrorBanner, Loading, Row, Screen, Section, Txt } from '@/components/ui';
import { unwrap, useQuery } from '@/hooks/use-query';
import { useAuth } from '@/lib/auth';
import { relativeDay } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { SessionOverview } from '@/lib/types';

type Filter = 'all' | 'mine';

export default function PlayScreen() {
  const { profile } = useAuth();
  const [filter, setFilter] = useState<Filter>('all');

  const q = useQuery(async () => {
    // Include sessions that started up to 3h ago so "now playing" stays visible.
    const since = new Date(Date.now() - 3 * 3600_000).toISOString();
    return unwrap(
      await supabase
        .from('session_overview')
        .select('*')
        .gte('ends_at', since)
        .order('starts_at', { ascending: true })
        .limit(100),
    ) as SessionOverview[];
  }, 'play');

  const sessions = (q.data ?? []).filter((s) =>
    filter === 'mine' ? s.my_status === 'confirmed' || s.my_status === 'waitlisted' : s.status === 'scheduled',
  );

  // Group the list by day for scanning.
  const byDay = new Map<string, SessionOverview[]>();
  for (const s of sessions) {
    const day = relativeDay(s.starts_at!);
    byDay.set(day, [...(byDay.get(day) ?? []), s]);
  }

  const firstName = profile?.full_name?.split(' ')[0];

  return (
    <Screen refreshing={q.refreshing} onRefresh={() => q.refetch()}>
      <View style={{ gap: 4 }}>
        <Txt variant="title">{firstName ? `Hi, ${firstName}` : 'Open play'}</Txt>
        <Txt tone="textSecondary">Upcoming sessions in your groups.</Txt>
      </View>

      {profile && !profile.full_name ? (
        <Card>
          <Txt variant="bodyBold">Finish your profile</Txt>
          <Txt variant="small" tone="textSecondary">
            Add your name and skill level so organizers know who&apos;s coming.
          </Txt>
          <Button title="Edit profile" variant="secondary" small onPress={() => router.push('/profile')} />
        </Card>
      ) : null}

      <Row>
        <Chip label="Upcoming" selected={filter === 'all'} onPress={() => setFilter('all')} />
        <Chip label="My bookings" selected={filter === 'mine'} onPress={() => setFilter('mine')} />
      </Row>

      {q.error ? <ErrorBanner message={q.error} onRetry={() => q.refetch()} /> : null}

      {q.loading ? (
        <Loading />
      ) : sessions.length === 0 ? (
        filter === 'mine' ? (
          <EmptyState
            icon="calendar-outline"
            title="No bookings yet"
            message="Book a spot in an upcoming session and it will show up here."
            action={<Button title="See all sessions" variant="secondary" small onPress={() => setFilter('all')} />}
          />
        ) : (
          <EmptyState
            icon="tennisball-outline"
            title="No sessions scheduled"
            message="Join a group with an invite code, or create your own group to start scheduling open play."
            action={<Button title="Go to groups" variant="secondary" small onPress={() => router.push('/groups')} />}
          />
        )
      ) : (
        [...byDay.entries()].map(([day, list]) => (
          <Section key={day} title={day}>
            {list.map((s) => (
              <SessionCard key={s.id} session={s} />
            ))}
          </Section>
        ))
      )}
    </Screen>
  );
}
