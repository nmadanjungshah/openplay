import { router } from 'expo-router';
import { View } from 'react-native';

import { Badge, Card, IconText, Row, Txt } from '@/components/ui';
import { formatNpr, formatTime, relativeDay, skillRange } from '@/lib/format';
import type { SessionOverview } from '@/lib/types';

export function bookingBadge(s: Pick<SessionOverview, 'my_status' | 'status'>) {
  if (s.status === 'cancelled') return <Badge label="Cancelled" tone="danger" />;
  if (s.my_status === 'confirmed') return <Badge label="You're in" tone="success" />;
  if (s.my_status === 'waitlisted') return <Badge label="Waitlisted" tone="warning" />;
  return null;
}

export function SessionCard({ session: s, showGroup = true }: { session: SessionOverview; showGroup?: boolean }) {
  const capacity = s.capacity ?? 0;
  const confirmed = s.confirmed_count ?? 0;
  const spotsLeft = Math.max(0, capacity - confirmed);
  const skills = skillRange(s.skill_min, s.skill_max);

  return (
    <Card onPress={() => router.push({ pathname: '/session/[id]', params: { id: s.id! } })}>
      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Txt variant="small" tone="primary" style={{ fontWeight: '700' }}>
            {relativeDay(s.starts_at!)} · {formatTime(s.starts_at!)}–{formatTime(s.ends_at!)}
          </Txt>
          <Txt variant="h2">{s.title}</Txt>
          {showGroup ? (
            <Txt variant="small" tone="textSecondary">
              {s.group_name}
            </Txt>
          ) : null}
        </View>
        {bookingBadge(s)}
      </Row>
      {s.location ? <IconText icon="location-outline">{s.location}</IconText> : null}
      <Row wrap gap={6}>
        {s.status === 'cancelled' ? null : spotsLeft > 0 ? (
          <Badge label={`${spotsLeft} of ${capacity} spots left`} tone={spotsLeft <= 2 ? 'warning' : 'neutral'} />
        ) : (
          <Badge label={`Full · ${s.waitlist_count ?? 0} waiting`} tone="danger" />
        )}
        {skills ? <Badge label={`Level ${skills}`} /> : null}
        <Badge label={formatNpr(s.fee_npr ?? 0)} />
      </Row>
    </Card>
  );
}
