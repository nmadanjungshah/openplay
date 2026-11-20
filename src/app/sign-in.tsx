import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';

import { Button, ErrorBanner, Field, Screen, Txt } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { errorMessage, supabase } from '@/lib/supabase';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SignIn() {
  const c = useTheme();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cleanEmail = email.trim().toLowerCase();

  async function sendCode() {
    if (!EMAIL_RE.test(cleanEmail)) {
      setError('Enter a valid email address.');
      return;
    }
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email: cleanEmail,
      options: {
        shouldCreateUser: true,
        data: name.trim() ? { full_name: name.trim() } : undefined,
        // Web: bring the link back to this site so the session is picked up from the URL.
        emailRedirectTo: Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin : undefined,
      },
    });
    setBusy(false);
    if (error) setError(errorMessage(error));
    else setStep('code');
  }

  async function verify() {
    const token = code.replace(/\D/g, '');
    if (token.length !== 6) {
      setError('Enter the 6-digit code from the email.');
      return;
    }
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.verifyOtp({ email: cleanEmail, token, type: 'email' });
    setBusy(false);
    // On success the auth listener swaps the navigator to the app.
    if (error) setError(errorMessage(error));
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <View style={{ gap: Spacing.two, marginTop: Spacing.five, alignItems: 'flex-start' }}>
          <View style={{ backgroundColor: c.accent, borderRadius: Radius.lg, padding: Spacing.three }}>
            <Ionicons name="tennisball" size={32} color={c.accentText} />
          </View>
          <Txt variant="title">OpenPlay</Txt>
          <Txt tone="textSecondary">
            Book open-play pickleball sessions, join the waitlist, and see who&apos;s playing.
          </Txt>
        </View>

        {error ? <ErrorBanner message={error} /> : null}

        {step === 'email' ? (
          <View style={{ gap: Spacing.three }}>
            <Field
              label="Email"
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              inputMode="email"
              returnKeyType="next"
            />
            <Field
              label="Your name"
              hint="New players only. Shown to your group."
              value={name}
              onChangeText={setName}
              placeholder="e.g. Asha Gurung"
              autoComplete="name"
              returnKeyType="send"
              onSubmitEditing={sendCode}
            />
            <Button title="Email me a code" icon="mail-outline" onPress={sendCode} loading={busy} />
          </View>
        ) : (
          <View style={{ gap: Spacing.three }}>
            <Txt>
              We emailed <Txt variant="bodyBold">{cleanEmail}</Txt>. Enter the 6-digit code, or open the sign-in link
              in the email{Platform.OS === 'web' ? ' in this browser' : ''}.
            </Txt>
            <Field
              label="Code"
              value={code}
              onChangeText={setCode}
              placeholder="123456"
              keyboardType="number-pad"
              inputMode="numeric"
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
              maxLength={6}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={verify}
              style={{ fontSize: 24, letterSpacing: 8 }}
            />
            <Button title="Sign in" onPress={verify} loading={busy} />
            <Button
              title="Use a different email"
              variant="ghost"
              onPress={() => {
                setStep('email');
                setCode('');
                setError(null);
              }}
            />
          </View>
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}
