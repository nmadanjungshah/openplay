import { router } from 'expo-router';
import { useState } from 'react';
import { Switch, View } from 'react-native';

import { Button, Card, ErrorBanner, Field, Row, Screen, Txt } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { errorMessage, supabase } from '@/lib/supabase';

export default function NewGroup() {
  const c = useTheme();
  const { session } = useAuth();
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    if (name.trim().length < 2) {
      setError('Give your group a name.');
      return;
    }
    setBusy(true);
    setError(null);
    const { data, error } = await supabase
      .from('groups')
      .insert({
        name: name.trim(),
        city: city.trim(),
        description: description.trim(),
        is_public: isPublic,
        owner_id: session!.user.id,
      })
      .select('id')
      .single();
    setBusy(false);
    if (error) {
      setError(errorMessage(error));
      return;
    }
    router.replace({ pathname: '/group/[id]', params: { id: data.id } });
  }

  return (
    <Screen hasHeader footer={<Button title="Create group" onPress={create} loading={busy} />}>
      <Txt tone="textSecondary">
        You&apos;ll be the organizer. Players join with an invite code you can share on WhatsApp or Viber.
      </Txt>
      {error ? <ErrorBanner message={error} /> : null}
      <Card>
        <Field label="Group name" value={name} onChangeText={setName} placeholder="e.g. Jhamsikhel Dinkers" maxLength={80} autoFocus />
        <Field label="City / area" value={city} onChangeText={setCity} placeholder="e.g. Lalitpur" maxLength={80} />
        <Field
          label="About"
          value={description}
          onChangeText={setDescription}
          placeholder="Where you play, who it's for, house rules…"
          multiline
          maxLength={1000}
        />
        <Row style={{ justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <Txt variant="bodyBold">List as a public group</Txt>
            <Txt variant="small" tone="textSecondary">
              Anyone signed in can find and join it without a code.
            </Txt>
          </View>
          <Switch value={isPublic} onValueChange={setIsPublic} trackColor={{ true: c.primary }} />
        </Row>
      </Card>
    </Screen>
  );
}
