import { useState } from 'react';
import { View } from 'react-native';

import { Avatar, Button, Card, Chip, ErrorBanner, Field, Row, Screen, Txt } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { SKILL_LEVELS } from '@/lib/format';
import { confirm, notify } from '@/lib/share';
import { errorMessage, supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/types';

export default function ProfileScreen() {
  const { profile } = useAuth();
  // Re-mount the form whenever the saved profile changes, so it starts from the stored values.
  return <ProfileForm key={profile ? `${profile.id}-${profile.updated_at}` : 'loading'} profile={profile} />;
}

function ProfileForm({ profile }: { profile: Profile | null }) {
  const { session, refreshProfile, signOut } = useAuth();
  const [name, setName] = useState(profile?.full_name ?? '');
  const [skill, setSkill] = useState<number | null>(profile?.skill_level ?? null);
  const [dupr, setDupr] = useState(profile?.dupr_id ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty =
    !!profile &&
    (name.trim() !== profile.full_name || skill !== profile.skill_level || (dupr.trim() || null) !== profile.dupr_id);

  async function save() {
    if (name.trim().length < 2) {
      setError('Enter your name (at least 2 characters).');
      return;
    }
    setSaving(true);
    setError(null);
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: name.trim(), skill_level: skill, dupr_id: dupr.trim() || null })
      .eq('id', session!.user.id);
    setSaving(false);
    if (error) {
      setError(errorMessage(error));
      return;
    }
    await refreshProfile();
    notify('Profile saved');
  }

  async function handleSignOut() {
    if (await confirm('Sign out?', 'You can sign back in with a code sent to your email.', 'Sign out')) {
      await signOut();
    }
  }

  return (
    <Screen>
      <Txt variant="title">Profile</Txt>

      <Row gap={Spacing.three}>
        <Avatar name={name || session?.user.email || '?'} size={56} />
        <View style={{ flex: 1 }}>
          <Txt variant="h2">{name || 'New player'}</Txt>
          <Txt variant="small" tone="textSecondary">
            {session?.user.email}
          </Txt>
        </View>
      </Row>

      {error ? <ErrorBanner message={error} /> : null}

      <Card>
        <Field label="Name" value={name} onChangeText={setName} placeholder="Your full name" autoComplete="name" maxLength={80} />

        <View style={{ gap: Spacing.one }}>
          <Txt variant="label">Skill level</Txt>
          <Txt variant="small" tone="textSecondary">
            Self-rated. Organizers can limit sessions to a level range.
          </Txt>
          <Row wrap>
            <Chip label="Not set" selected={skill == null} onPress={() => setSkill(null)} />
            {SKILL_LEVELS.map((lvl) => (
              <Chip key={lvl} label={lvl.toFixed(1)} selected={skill === lvl} onPress={() => setSkill(lvl)} />
            ))}
          </Row>
        </View>

        <Field
          label="DUPR ID (optional)"
          hint="Stored on your profile so organizers can look up your rating."
          value={dupr}
          onChangeText={setDupr}
          placeholder="e.g. 8XK2LM"
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={20}
        />

        <Button title="Save profile" onPress={save} loading={saving} disabled={!dirty} />
      </Card>

      <Button title="Sign out" variant="danger" icon="log-out-outline" onPress={handleSignOut} />
    </Screen>
  );
}
