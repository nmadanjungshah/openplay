import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';

import { Button, ErrorBanner, Loading, Screen, Txt } from '@/components/ui';
import { errorMessage, supabase } from '@/lib/supabase';

/** Deep link target for shared invites: /join/ABC123 */
export default function JoinByLink() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase.rpc('join_group', { code: String(code ?? '') }).then(({ data, error }) => {
      if (cancelled) return;
      if (error) setError(errorMessage(error));
      else router.replace({ pathname: '/group/[id]', params: { id: data } });
    });
    return () => {
      cancelled = true;
    };
  }, [code]);

  return (
    <Screen hasHeader>
      {error ? (
        <>
          <ErrorBanner message={error} />
          <Txt tone="textSecondary">Check the code with your organizer, or enter it on the Groups tab.</Txt>
          <Button title="Go to groups" variant="secondary" onPress={() => router.replace('/groups')} />
        </>
      ) : (
        <>
          <Txt>Joining group {String(code ?? '').toUpperCase()}…</Txt>
          <Loading />
        </>
      )}
    </Screen>
  );
}
