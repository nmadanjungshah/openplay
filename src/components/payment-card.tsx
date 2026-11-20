import { useState } from 'react';
import { View } from 'react-native';

import { PrivateImage } from '@/components/private-image';
import { Badge, Button, Card, Chip, ErrorBanner, Field, IconText, Row, Txt } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useNow } from '@/hooks/use-now';
import { formatNpr } from '@/lib/format';
import { pickImage, randomFileId, uploadImage, type PickedImage } from '@/lib/storage';
import { errorMessage, supabase } from '@/lib/supabase';
import { METHOD_LABEL, type BookingStatus, type Group, type Payment, type PaymentMethod } from '@/lib/types';

export type PayInfo = Pick<
  Group,
  'id' | 'payment_mode' | 'esewa_id' | 'khalti_id' | 'esewa_qr_path' | 'khalti_qr_path' | 'payment_note'
>;

type Props = {
  sessionId: string;
  fee: number;
  status: BookingStatus;
  holdExpiresAt: string | null;
  payment: Pick<Payment, 'id' | 'status' | 'method' | 'reference' | 'note'> | null;
  group: PayInfo;
  userId: string;
  onChanged: () => void;
};

function mmss(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** The current player's payment state for a booked session. */
export function PaymentCard({ sessionId, fee, status, holdExpiresAt, payment, group, userId, onChanged }: Props) {
  const now = useNow(1000);
  const wallets = (['esewa', 'khalti'] as const).filter((w) =>
    w === 'esewa' ? group.esewa_qr_path || group.esewa_id : group.khalti_qr_path || group.khalti_id,
  );
  const [wallet, setWallet] = useState<'esewa' | 'khalti'>(wallets[0] ?? 'esewa');
  const [method, setMethod] = useState<PaymentMethod>(wallets[0] ?? 'esewa');
  const [reference, setReference] = useState('');
  const [proof, setProof] = useState<PickedImage | null>(null);
  const [open, setOpen] = useState(status === 'pending_payment');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (fee <= 0 || (status !== 'confirmed' && status !== 'pending_payment')) return null;

  if (payment?.status === 'confirmed') {
    return (
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt variant="bodyBold">Payment</Txt>
          <Badge label="Paid" tone="success" />
        </Row>
        <IconText icon="checkmark-circle-outline" tone="success">
          {formatNpr(fee)} received by the organizer via {METHOD_LABEL[payment.method]}
        </IconText>
      </Card>
    );
  }

  if (payment?.status === 'claimed') {
    return (
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt variant="bodyBold">Payment</Txt>
          <Badge label="Verifying" tone="warning" />
        </Row>
        <Txt variant="small" tone="textSecondary">
          You sent {formatNpr(fee)} by {METHOD_LABEL[payment.method]}
          {payment.reference ? ` (ref ${payment.reference})` : ''}. The organizer will confirm it shortly.
          {status === 'pending_payment' ? ' Your spot is held until then.' : ''}
        </Txt>
      </Card>
    );
  }

  const holdLeft = holdExpiresAt ? new Date(holdExpiresAt).getTime() - now : null;
  const expired = status === 'pending_payment' && holdLeft != null && holdLeft <= 0;

  async function submit() {
    setError(null);
    if (method !== 'cash' && reference.trim().length < 4 && !proof) {
      setError('Add the transaction ID from your eSewa/Khalti receipt, or attach a screenshot.');
      return;
    }
    setBusy(true);
    try {
      let proofPath: string | null = null;
      if (proof) {
        proofPath = await uploadImage('payment-proofs', `${group.id}/${userId}/${randomFileId()}.${proof.ext}`, proof);
      }
      const { error } = await supabase.rpc('claim_payment', {
        session_id: sessionId,
        method,
        reference: reference.trim(),
        proof_path: proofPath ?? undefined,
      });
      if (error) throw error;
      onChanged();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt variant="bodyBold">{status === 'pending_payment' ? `Pay ${formatNpr(fee)} to confirm` : `Fee ${formatNpr(fee)}`}</Txt>
        {status === 'pending_payment' ? (
          <Badge label={expired ? 'Hold expired' : `Held ${mmss(holdLeft ?? 0)}`} tone={expired ? 'danger' : 'warning'} />
        ) : (
          <Badge label="Unpaid" />
        )}
      </Row>

      {payment?.status === 'rejected' ? (
        <ErrorBanner
          message={`The organizer couldn't find your last payment${payment.note ? `: “${payment.note}”` : '.'} Check the details and submit again.`}
        />
      ) : null}

      {status === 'confirmed' ? (
        <Txt variant="small" tone="textSecondary">
          Your spot is confirmed. Pay at the court, or pay now by QR and let the organizer know.
        </Txt>
      ) : expired ? (
        <Txt variant="small" tone="danger">
          Your hold has run out. The spot will be released shortly. Book again if it&apos;s still open.
        </Txt>
      ) : (
        <Txt variant="small" tone="textSecondary">
          Scan the organizer&apos;s QR, pay {formatNpr(fee)}, then send the transaction ID below. Your spot is confirmed once
          they verify it.
        </Txt>
      )}

      {!open ? (
        <Button title="Pay now by QR" icon="qr-code-outline" variant="secondary" small onPress={() => setOpen(true)} />
      ) : (
        <View style={{ gap: Spacing.three }}>
          {wallets.length ? (
            <>
              {wallets.length > 1 ? (
                <Row>
                  {wallets.map((w) => (
                    <Chip
                      key={w}
                      label={METHOD_LABEL[w]}
                      selected={wallet === w}
                      onPress={() => {
                        setWallet(w);
                        setMethod(w);
                      }}
                    />
                  ))}
                </Row>
              ) : null}
              <View style={{ alignItems: 'center', gap: Spacing.two }}>
                {(wallet === 'esewa' ? group.esewa_qr_path : group.khalti_qr_path) ? (
                  <PrivateImage
                    bucket="payment-qr"
                    path={(wallet === 'esewa' ? group.esewa_qr_path : group.khalti_qr_path)!}
                    size={220}
                    label={`${METHOD_LABEL[wallet]} QR code`}
                  />
                ) : null}
                {(wallet === 'esewa' ? group.esewa_id : group.khalti_id) ? (
                  <Txt variant="bodyBold" selectable>
                    {METHOD_LABEL[wallet]} ID: {wallet === 'esewa' ? group.esewa_id : group.khalti_id}
                  </Txt>
                ) : null}
              </View>
            </>
          ) : (
            <Txt variant="small" tone="textSecondary">
              The organizer hasn&apos;t added a QR code yet. Ask them how to pay.
            </Txt>
          )}
          {group.payment_note ? <IconText icon="information-circle-outline">{group.payment_note}</IconText> : null}

          <View style={{ gap: Spacing.one }}>
            <Txt variant="label">Paid with</Txt>
            <Row wrap>
              {(['esewa', 'khalti', 'other'] as const).map((m) => (
                <Chip key={m} label={METHOD_LABEL[m]} selected={method === m} onPress={() => setMethod(m)} />
              ))}
            </Row>
          </View>
          <Field
            label="Transaction ID"
            value={reference}
            onChangeText={setReference}
            placeholder="From your eSewa/Khalti receipt"
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={100}
          />
          <Row wrap>
            <Button
              title={proof ? 'Screenshot attached ✓' : 'Attach screenshot (optional)'}
              icon="image-outline"
              variant="secondary"
              small
              onPress={async () => setProof(await pickImage())}
            />
            {proof ? <Button title="Remove" variant="ghost" small onPress={() => setProof(null)} /> : null}
          </Row>
          {error ? <ErrorBanner message={error} /> : null}
          <Button title="I've paid" icon="checkmark-done-outline" onPress={submit} loading={busy} disabled={expired} />
        </View>
      )}
    </Card>
  );
}
