import { router, Stack, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { SessionCard } from '@/components/session-card';
import { Avatar, Badge, Button, Card, EmptyState, ErrorBanner, Hero, HeroStat, Loading, Row, Screen, Section, Txt } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { unwrap, useQuery } from '@/hooks/use-query';
import { useAuth } from '@/lib/auth';
import { appLink, confirm, notify, shareText } from '@/lib/share';
import { errorMessage, supabase } from '@/lib/supabase';
import type { Group, MemberRole, Profile, SessionOverview } from '@/lib/types';
import { goBackOr } from '@/lib/nav';

type Member = {
  user_id: string;
  role: MemberRole;
  profiles: Pick<Profile, 'full_name' | 'skill_level'> | null;
};

export default function GroupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const uid = session!.user.id;

  const q = useQuery(async () => {
    const [group, members, sessions] = await Promise.all([
      supabase.from('groups').select('*').eq('id', id).maybeSingle(),
      supabase.from('group_members').select('user_id, role, profiles(full_name, skill_level)').eq('group_id', id),
      supabase
        .from('session_overview')
        .select('*')
        .eq('group_id', id)
        .gte('ends_at', new Date().toISOString())
        .order('starts_at')
        .limit(30),
    ]);
    return {
      group: unwrap(group) as Group | null,
      members: (unwrap(members) as Member[]).sort(
        (a, b) =>
          Number(b.role === 'organizer') - Number(a.role === 'organizer') ||
          (a.profiles?.full_name ?? '').localeCompare(b.profiles?.full_name ?? ''),
      ),
      sessions: unwrap(sessions) as SessionOverview[],
    };
  }, `group-${id}`);

  const group = q.data?.group;
  const me = q.data?.members.find((m) => m.user_id === uid);
  const isOrganizer = me?.role === 'organizer';

  async function invite() {
    if (!group) return;
    const link = appLink(`/join/${group.invite_code}`);
    const result = await shareText(
      `Join "${group.name}" on OpenPlay to book open-play pickleball.\n\nInvite code: ${group.invite_code}\n${link}`,
      `Join ${group.name}`,
    );
    if (result === 'copied') notify('Invite copied', 'Paste it into WhatsApp, Viber or Messenger.');
  }

  async function setRole(member: Member, role: MemberRole) {
    const { error } = await supabase
      .from('group_members')
      .update({ role })
      .eq('group_id', id)
      .eq('user_id', member.user_id);
    if (error) notify('Could not update role', errorMessage(error));
    q.refetch(true);
  }

  async function leave() {
    if (!group) return;
    if (group.owner_id === uid) {
      notify('You own this group', 'Owners can’t leave their own group yet.');
      return;
    }
    if (!(await confirm('Leave group?', `You'll stop seeing ${group.name}'s sessions.`, 'Leave'))) return;
    const { error } = await supabase.from('group_members').delete().eq('group_id', id).eq('user_id', uid);
    if (error) notify('Could not leave', errorMessage(error));
    else goBackOr('/groups');
  }

  if (q.loading) {
    return (
      <Screen hasHeader>
        <Loading />
      </Screen>
    );
  }

  if (!group) {
    return (
      <Screen hasHeader>
        {q.error ? <ErrorBanner message={q.error} onRetry={() => q.refetch()} /> : null}
        <EmptyState icon="people-outline" title="Group not found" message="You may not be a member of this group." />
      </Screen>
    );
  }

  return (
    <Screen
      hasHeader
      refreshing={q.refreshing}
      onRefresh={() => q.refetch()}
      hero={
        <Hero
          underHeader
          eyebrow={isOrganizer ? 'You organize this group' : 'Group'}
          title={group.name}
          subtitle={group.city || undefined}
          action={group.is_public ? <Badge label="Public" tone="accent" /> : undefined}>
          <Row wrap gap={Spacing.two} style={{ marginTop: Spacing.two }}>
            <HeroStat value={String(q.data!.members.length)} label="Members" accent />
            <HeroStat value={String(q.data!.sessions.length)} label="Upcoming" />
            <HeroStat value={String(q.data!.members.filter((m) => m.role === 'organizer').length)} label="Organizers" />
          </Row>
        </Hero>
      }>
      <Stack.Screen options={{ title: '' }} />
      {group.description ? <Txt>{group.description}</Txt> : null}

      {q.error ? <ErrorBanner message={q.error} onRetry={() => q.refetch()} /> : null}

      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <View>
            <Txt variant="label" tone="textSecondary">
              Invite code
            </Txt>
            <Txt variant="title" selectable style={{ letterSpacing: 4 }}>
              {group.invite_code}
            </Txt>
          </View>
          <Button title="Invite" icon="share-social-outline" variant="secondary" small onPress={invite} />
        </Row>
      </Card>

      {isOrganizer ? (
        <Card onPress={() => router.push({ pathname: '/group/[id]/payments', params: { id } })}>
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Txt variant="bodyBold">Payments</Txt>
              <Txt variant="small" tone="textSecondary">
                {group.payment_mode === 'pay_to_confirm' ? 'Players pay to confirm their spot' : 'Players pay at the court'}
                {group.esewa_qr_path || group.khalti_qr_path ? ' · QR added' : ' · No QR yet'}
              </Txt>
            </View>
            <Badge label="Settings" />
          </Row>
        </Card>
      ) : null}

      <Section
        title="Upcoming sessions"
        action={
          isOrganizer ? (
            <Button
              title="New session"
              icon="add"
              small
              onPress={() => router.push({ pathname: '/group/[id]/new-session', params: { id } })}
            />
          ) : null
        }>
        {q.data!.sessions.length ? (
          q.data!.sessions.map((s) => <SessionCard key={s.id} session={s} showGroup={false} />)
        ) : (
          <EmptyState
            icon="calendar-outline"
            title="Nothing scheduled"
            message={isOrganizer ? 'Create a one-off or weekly open-play session.' : 'Your organizer hasn’t posted sessions yet.'}
          />
        )}
      </Section>

      <Section title={`Members · ${q.data!.members.length}`}>
        <Card>
          {q.data!.members.map((m) => (
            <Row key={m.user_id} style={{ paddingVertical: 4 }}>
              <Avatar name={m.profiles?.full_name || '?'} />
              <View style={{ flex: 1 }}>
                <Txt variant="bodyBold">
                  {m.profiles?.full_name || 'Unnamed player'}
                  {m.user_id === uid ? ' (you)' : ''}
                </Txt>
                <Txt variant="small" tone="textSecondary">
                  {m.profiles?.skill_level != null ? `Level ${m.profiles.skill_level.toFixed(1)}` : 'Level not set'}
                </Txt>
              </View>
              {m.role === 'organizer' ? <Badge label="Organizer" tone="accent" /> : null}
              {isOrganizer && m.user_id !== uid && m.user_id !== group.owner_id ? (
                <Button
                  title={m.role === 'organizer' ? 'Remove organizer' : 'Make organizer'}
                  variant="ghost"
                  small
                  onPress={() => setRole(m, m.role === 'organizer' ? 'member' : 'organizer')}
                />
              ) : null}
            </Row>
          ))}
        </Card>
      </Section>

      {group.owner_id !== uid ? (
        <Button title="Leave group" variant="danger" icon="exit-outline" onPress={leave} />
      ) : null}
    </Screen>
  );
}
