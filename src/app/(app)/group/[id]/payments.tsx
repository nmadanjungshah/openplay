import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { PrivateImage } from '@/components/private-image';
import { Button, Card, Chip, EmptyState, ErrorBanner, Field, Loading, Row, Screen, Stepper, Txt } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { unwrap, useQuery } from '@/hooks/use-query';
import { notify } from '@/lib/share';
import { pickImage, randomFileId, uploadImage } from '@/lib/storage';
import { errorMessage, supabase } from '@/lib/supabase';
import type { Group, PaymentMode } from '@/lib/types';

export default function PaymentSettingsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useQuery(
    async () => unwrap(await supabase.from('groups').select('*').eq('id', id).maybeSingle()) as Group | null,
    `group-payments-${id}`,
  );

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
        <EmptyState icon="card-outline" title="Group not found" message="Only organizers can change payment settings." />
      </Screen>
    );
  }
  // Remount when the stored settings change so the form starts from saved values.
  return <PaymentSettingsForm key={q.data.id} group={q.data} />;
}

function PaymentSettingsForm({ group }: { group: Group }) {
  const [mode, setMode] = useState<PaymentMode>(group.payment_mode);
  const [hold, setHold] = useState(group.hold_minutes);
  const [esewaId, setEsewaId] = useState(group.esewa_id);
  const [khaltiId, setKhaltiId] = useState(group.khalti_id);
  const [note, setNote] = useState(group.payment_note);
  const [esewaQr, setEsewaQr] = useState(group.esewa_qr_path);
  const [khaltiQr, setKhaltiQr] = useState(group.khalti_qr_path);
  const [uploading, setUploading] = useState<'esewa' | 'khalti' | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function uploadQr(wallet: 'esewa' | 'khalti') {
    const image = await pickImage();
    if (!image) return;
    setUploading(wallet);
    setError(null);
    try {
      // New file name each time so cached signed URLs never show the old QR.
      const path = await uploadImage('payment-qr', `${group.id}/${wallet}-${randomFileId()}.${image.ext}`, image);
      if (wallet === 'esewa') setEsewaQr(path);
      else setKhaltiQr(path);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setUploading(null);
    }
  }

  async function save() {
    if (mode === 'pay_to_confirm' && !esewaQr && !khaltiQr && !esewaId.trim() && !khaltiId.trim()) {
      setError('Add at least one eSewa or Khalti QR code or ID so players know where to pay.');
      return;
    }
    setSaving(true);
    setError(null);
    const { error } = await supabase
      .from('groups')
      .update({
        payment_mode: mode,
        hold_minutes: hold,
        esewa_id: esewaId.trim(),
        khalti_id: khaltiId.trim(),
        esewa_qr_path: esewaQr,
        khalti_qr_path: khaltiQr,
        payment_note: note.trim(),
      })
      .eq('id', group.id);
    setSaving(false);
    if (error) {
      setError(errorMessage(error));
      return;
    }
    notify('Payment settings saved');
    router.back();
  }

  const qrBlock = (wallet: 'esewa' | 'khalti', label: string, path: string | null, clear: () => void) => (
    <View style={{ gap: Spacing.two, flex: 1, minWidth: 220 }}>
      <Txt variant="label">{label} QR code</Txt>
      {path ? <PrivateImage bucket="payment-qr" path={path} size={180} label={`${label} QR code`} /> : null}
      <Row wrap>
        <Button
          title={path ? 'Replace' : `Upload ${label} QR`}
          icon="qr-code-outline"
          variant="secondary"
          small
          loading={uploading === wallet}
          onPress={() => uploadQr(wallet)}
        />
        {path ? <Button title="Remove" variant="ghost" small onPress={clear} /> : null}
      </Row>
    </View>
  );

  return (
    <Screen hasHeader footer={<Button title="Save payment settings" onPress={save} loading={saving} />}>
      {error ? <ErrorBanner message={error} /> : null}

      <Card>
        <Txt variant="label">When do players pay?</Txt>
        <Row wrap>
          <Chip label="At the court" selected={mode === 'pay_at_court'} onPress={() => setMode('pay_at_court')} />
          <Chip label="To confirm a spot" selected={mode === 'pay_to_confirm'} onPress={() => setMode('pay_to_confirm')} />
        </Row>
        <Txt variant="small" tone="textSecondary">
          {mode === 'pay_at_court'
            ? 'Booking is confirmed straight away. Mark players paid at the court, or verify when they send a QR payment.'
            : 'For paid sessions, a booking holds the spot while the player pays your QR. The spot is confirmed once you verify the payment.'}
        </Txt>
        {mode === 'pay_to_confirm' ? (
          <Stepper label="Hold spot for" value={hold} min={5} max={120} step={5} onChange={setHold} format={(v) => `${v} min`} />
        ) : null}
      </Card>

      <Card>
        <Txt variant="bodyBold">Where players pay you</Txt>
        <Txt variant="small" tone="textSecondary">
          Upload the QR from your eSewa or Khalti app (My QR / Receive money). Only members of this group can see it.
        </Txt>
        <Row wrap gap={Spacing.three} style={{ alignItems: 'flex-start' }}>
          {qrBlock('esewa', 'eSewa', esewaQr, () => setEsewaQr(null))}
          {qrBlock('khalti', 'Khalti', khaltiQr, () => setKhaltiQr(null))}
        </Row>
        <Field label="eSewa ID (phone)" value={esewaId} onChangeText={setEsewaId} placeholder="98XXXXXXXX" keyboardType="phone-pad" maxLength={40} />
        <Field label="Khalti ID (phone)" value={khaltiId} onChangeText={setKhaltiId} placeholder="98XXXXXXXX" keyboardType="phone-pad" maxLength={40} />
        <Field
          label="Note for players"
          value={note}
          onChangeText={setNote}
          placeholder="e.g. Put your name in the remarks."
          multiline
          maxLength={500}
        />
      </Card>
    </Screen>
  );
}
