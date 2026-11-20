import { router } from 'expo-router';
import { View } from 'react-native';

import { Badge, CapacityBar, Card, DateBlock, IconText, Row, Txt } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { formatNpr, formatTime, relativeDay, skillRange } from '@/lib/format';
import type { SessionOverview } from '@/lib/types';

export function bookingBadge(s: Pick<SessionOverview, 'my_status' | 'status'>) {
  if (s.status === 'cancelled') return <Badge label="Cancelled" tone="danger" />;
  if (s.my_status === 'confirmed') return <Badge label="You're in" tone="success" />;
  if (s.my_status === 'waitlisted') return <Badge label="Waitlisted" tone="warning" />;
  if (s.my_status === 'pending_payment') return <Badge label="Pay to confirm" tone="warning" />;
  return null;
}

export function SessionCard({ session: s, showGroup = true }: { session: SessionOverview; showGroup?: boolean }) {
  const capacity = s.capacity ?? 0;
  // Spots held for payment count as taken.
  const taken = (s.confirmed_count ?? 0) + (s.pending_count ?? 0);
  const spotsLeft = Math.max(0, capacity - taken);
  const skills = skillRange(s.skill_min, s.skill_max);
  const mine = s.my_status === 'confirmed' || s.my_status === 'pending_payment';
  const cancelled = s.status === 'cancelled';

  return (
    <Card
      accent={mine && !cancelled}
      style={cancelled ? { opacity: 0.6 } : undefined}
      onPress={() => router.push({ pathname: '/session/[id]', params: { id: s.id! } })}>
      <Row gap={Spacing.three} style={{ alignItems: 'stretch' }}>
        <DateBlock date={new Date(s.starts_at!)} highlight={mine && !cancelled} />
        <View style={{ flex: 1, gap: 4 }}>
          <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <Txt variant="small" tone="tint" style={{ fontFamily: 'Inter_700Bold', flexShrink: 1 }}>
              {relativeDay(s.starts_at!)} · {formatTime(s.starts_at!)}–{formatTime(s.ends_at!)}
            </Txt>
            {bookingBadge(s)}
          </Row>
          <Txt variant="h2" numberOfLines={1}>
            {s.title}
          </Txt>
          {showGroup ? (
            <Txt variant="small" tone="textSecondary" numberOfLines={1}>
              {s.group_name}
            </Txt>
          ) : null}
          {s.location ? <IconText icon="location">{s.location}</IconText> : null}
        </View>
      </Row>

      {!cancelled ? <CapacityBar value={taken} max={capacity} /> : null}

      <Row wrap gap={6}>
        {cancelled ? null : spotsLeft > 0 ? (
          <Badge label={`${spotsLeft} of ${capacity} spots left`} tone={spotsLeft <= 2 ? 'warning' : 'neutral'} />
        ) : (
          <Badge label={`Full · ${s.waitlist_count ?? 0} waiting`} tone="danger" />
        )}
        {skills ? <Badge label={`Level ${skills}`} /> : null}
        <Badge label={formatNpr(s.fee_npr ?? 0)} />
        {(s.fee_npr ?? 0) > 0 && s.payment_mode === 'pay_to_confirm' ? <Badge label="Pay to confirm" tone="accent" /> : null}
      </Row>
    </Card>
  );
}
