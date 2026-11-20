import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Badge, Button, Card, EmptyState, ErrorBanner, Field, Loading, Row, Screen, Section, Txt } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { unwrap, useQuery } from '@/hooks/use-query';
import { useAuth } from '@/lib/auth';
import { errorMessage, supabase } from '@/lib/supabase';
import type { Group, MemberRole } from '@/lib/types';

type MyGroup = { role: MemberRole; groups: Group | null };

export default function GroupsScreen() {
  const c = useTheme();
  const { session } = useAuth();
  const uid = session!.user.id;
  const [code, setCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  const q = useQuery(async () => {
    const [mine, publicGroups] = await Promise.all([
      supabase.from('group_members').select('role, groups(*)').eq('user_id', uid),
      supabase.from('groups').select('*').eq('is_public', true).order('created_at', { ascending: false }).limit(20),
    ]);
    const memberships = (unwrap(mine) as MyGroup[]).filter((m) => m.groups);
    const joined = new Set(memberships.map((m) => m.groups!.id));
    return {
      memberships: memberships.sort((a, b) => a.groups!.name.localeCompare(b.groups!.name)),
      discover: (unwrap(publicGroups) as Group[]).filter((g) => !joined.has(g.id)),
    };
  }, `groups-${uid}`);

  async function join() {
    const clean = code.trim().toUpperCase();
    if (clean.length < 4) {
      setJoinError('Enter the invite code your organizer shared.');
      return;
    }
    setJoining(true);
    setJoinError(null);
    const { data, error } = await supabase.rpc('join_group', { code: clean });
    setJoining(false);
    if (error) {
      setJoinError(errorMessage(error));
      return;
    }
    setCode('');
    router.push({ pathname: '/group/[id]', params: { id: data } });
  }

  async function joinPublic(id: string) {
    const { error } = await supabase.rpc('join_public_group', { group_id: id });
    if (error) setJoinError(errorMessage(error));
    else router.push({ pathname: '/group/[id]', params: { id } });
  }

  return (
    <Screen refreshing={q.refreshing} onRefresh={() => q.refetch()}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt variant="title">Groups</Txt>
        <Button title="New group" icon="add" small onPress={() => router.push('/group/new')} />
      </Row>

      <Card>
        <Txt variant="bodyBold">Have an invite code?</Txt>
        <Row style={{ alignItems: 'flex-end' }}>
          <View style={{ flex: 1 }}>
            <Field
              label="Invite code"
              value={code}
              onChangeText={setCode}
              placeholder="e.g. K7Q2PA"
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={12}
              returnKeyType="go"
              onSubmitEditing={join}
            />
          </View>
          <Button title="Join" onPress={join} loading={joining} />
        </Row>
        {joinError ? <ErrorBanner message={joinError} /> : null}
      </Card>

      {q.error ? <ErrorBanner message={q.error} onRetry={() => q.refetch()} /> : null}

      {q.loading ? (
        <Loading />
      ) : (
        <>
          <Section title="Your groups">
            {q.data?.memberships.length ? (
              q.data.memberships.map(({ role, groups: g }) => (
                <Card key={g!.id} onPress={() => router.push({ pathname: '/group/[id]', params: { id: g!.id } })}>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Txt variant="h2">{g!.name}</Txt>
                      {g!.city ? (
                        <Txt variant="small" tone="textSecondary">
                          {g!.city}
                        </Txt>
                      ) : null}
                    </View>
                    {role === 'organizer' ? <Badge label="Organizer" tone="accent" /> : null}
                    <Ionicons name="chevron-forward" size={18} color={c.textSecondary} />
                  </Row>
                </Card>
              ))
            ) : (
              <EmptyState
                icon="people-outline"
                title="You're not in a group yet"
                message="Ask your organizer for an invite code, or start a group for your crew."
              />
            )}
          </Section>

          {q.data?.discover.length ? (
            <Section title="Public groups">
              {q.data.discover.map((g) => (
                <Card key={g.id}>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Txt variant="bodyBold">{g.name}</Txt>
                      <Txt variant="small" tone="textSecondary" numberOfLines={2}>
                        {[g.city, g.description].filter(Boolean).join(' · ') || 'Open to everyone'}
                      </Txt>
                    </View>
                    <Button title="Join" variant="secondary" small onPress={() => joinPublic(g.id)} />
                  </Row>
                </Card>
              ))}
            </Section>
          ) : null}
        </>
      )}
    </Screen>
  );
}
