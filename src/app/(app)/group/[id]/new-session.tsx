import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { Button, Card, Chip, ErrorBanner, Field, Row, Screen, Stepper, Txt } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useNow } from '@/hooks/use-now';
import { useAuth } from '@/lib/auth';
import { formatDay, formatNpr, formatTime, parseTime, SKILL_LEVELS, startOfDay } from '@/lib/format';
import { errorMessage, supabase } from '@/lib/supabase';

const DURATIONS = [60, 90, 120, 180];
const REPEATS = [
  { weeks: 1, label: 'Just once' },
  { weeks: 4, label: '4 weeks' },
  { weeks: 8, label: '8 weeks' },
  { weeks: 12, label: '12 weeks' },
];

function randomId(): string {
  return globalThis.crypto?.randomUUID?.() ??
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
      const r = (Math.random() * 16) | 0;
      return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
}

export default function NewSession() {
  const { id: groupId } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const now = useNow();

  const days = useMemo(() => {
    const today = startOfDay(new Date());
    return Array.from({ length: 21 }, (_, i) => new Date(today.getFullYear(), today.getMonth(), today.getDate() + i));
  }, []);

  const [title, setTitle] = useState('Open play');
  const [location, setLocation] = useState('');
  const [day, setDay] = useState(days[1]);
  const [time, setTime] = useState('07:00');
  const [duration, setDuration] = useState(120);
  const [courts, setCourts] = useState(4);
  const [capacity, setCapacity] = useState(16);
  const [fee, setFee] = useState('0');
  const [skillMin, setSkillMin] = useState<number | null>(null);
  const [skillMax, setSkillMax] = useState<number | null>(null);
  const [cutoff, setCutoff] = useState(2);
  const [weeks, setWeeks] = useState(1);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsedTime = parseTime(time);
  const start = parsedTime
    ? new Date(day.getFullYear(), day.getMonth(), day.getDate(), parsedTime[0], parsedTime[1])
    : null;
  const end = start ? new Date(start.getTime() + duration * 60_000) : null;
  const feeNum = Number(fee.replace(/[^\d]/g, '') || '0');

  async function create() {
    if (title.trim().length < 2) return setError('Add a title.');
    if (!start || !end) return setError('Enter the start time as HH:MM, e.g. 07:00 or 18:30.');
    if (start.getTime() <= now) return setError('Pick a start time in the future.');
    if (skillMin != null && skillMax != null && skillMin > skillMax) {
      return setError('Minimum level must be at or below the maximum.');
    }

    setBusy(true);
    setError(null);
    const recurrenceId = weeks > 1 ? randomId() : null;
    const rows = Array.from({ length: weeks }, (_, i) => {
      // Add whole calendar weeks in local time so the wall-clock time stays put.
      const s = new Date(start);
      s.setDate(s.getDate() + 7 * i);
      const e = new Date(s.getTime() + duration * 60_000);
      return {
        group_id: groupId,
        recurrence_id: recurrenceId,
        title: title.trim(),
        location: location.trim(),
        notes: notes.trim(),
        starts_at: s.toISOString(),
        ends_at: e.toISOString(),
        capacity,
        courts,
        fee_npr: feeNum,
        skill_min: skillMin,
        skill_max: skillMax,
        cancel_cutoff_hours: cutoff,
        created_by: session!.user.id,
      };
    });

    const { error } = await supabase.from('sessions').insert(rows);
    setBusy(false);
    if (error) return setError(errorMessage(error));
    router.back();
  }

  const summary = start && end
    ? `${formatDay(start)} · ${formatTime(start)}–${formatTime(end)}${weeks > 1 ? ` · weekly × ${weeks}` : ''}`
    : 'Enter a valid start time';

  return (
    <Screen
      hasHeader
      footer={
        <View style={{ gap: Spacing.two }}>
          <Txt variant="small" tone="textSecondary" style={{ textAlign: 'center' }}>
            {summary} · {capacity} {capacity === 1 ? 'player' : 'players'} · {formatNpr(feeNum)}
          </Txt>
          <Button title={weeks > 1 ? `Create ${weeks} sessions` : 'Create session'} onPress={create} loading={busy} />
        </View>
      }>
      {error ? <ErrorBanner message={error} /> : null}

      <Card>
        <Field label="Title" value={title} onChangeText={setTitle} maxLength={80} />
        <Field label="Location" value={location} onChangeText={setLocation} placeholder="e.g. Satdobato Sports Complex, courts 1–4" maxLength={200} />
      </Card>

      <Card>
        <Txt variant="label">Date</Txt>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: Spacing.two }}>
          {days.map((d) => (
            <Chip key={d.toISOString()} label={formatDay(d)} selected={d.getTime() === day.getTime()} onPress={() => setDay(d)} />
          ))}
        </ScrollView>
        <Row style={{ alignItems: 'flex-start' }}>
          <View style={{ width: 130 }}>
            <Field label="Start (24h)" value={time} onChangeText={setTime} placeholder="07:00" inputMode="numeric" maxLength={5} />
          </View>
          <View style={{ flex: 1, gap: Spacing.one }}>
            <Txt variant="label">Duration</Txt>
            <Row wrap>
              {DURATIONS.map((m) => (
                <Chip key={m} label={`${m / 60}h`} selected={duration === m} onPress={() => setDuration(m)} />
              ))}
            </Row>
          </View>
        </Row>
        <Txt variant="label">Repeat weekly</Txt>
        <Row wrap>
          {REPEATS.map((r) => (
            <Chip key={r.weeks} label={r.label} selected={weeks === r.weeks} onPress={() => setWeeks(r.weeks)} />
          ))}
        </Row>
      </Card>

      <Card>
        <Row wrap gap={Spacing.three}>
          <Stepper
            label="Courts"
            value={courts}
            min={1}
            max={50}
            onChange={(v) => {
              setCourts(v);
              setCapacity(Math.max(capacity, v * 4));
            }}
          />
          <Stepper label="Max players" value={capacity} min={1} max={200} onChange={setCapacity} />
        </Row>
        <Txt variant="small" tone="textSecondary">
          Players beyond the limit join a waitlist and move up automatically when someone cancels.
        </Txt>
        <Row wrap gap={Spacing.three} style={{ alignItems: 'flex-start' }}>
          <View style={{ flex: 1, minWidth: 140 }}>
            <Field label="Drop-in fee (NPR)" value={fee} onChangeText={setFee} inputMode="numeric" keyboardType="number-pad" maxLength={6} hint="0 = free" />
          </View>
          <Stepper label="Cancel cutoff" value={cutoff} min={0} max={48} onChange={setCutoff} format={(v) => `${v}h`} />
        </Row>
      </Card>

      <Card>
        <Txt variant="label">Skill level (optional)</Txt>
        <Txt variant="small" tone="textSecondary">Minimum</Txt>
        <Row wrap>
          <Chip label="Any" selected={skillMin == null} onPress={() => setSkillMin(null)} />
          {SKILL_LEVELS.map((l) => (
            <Chip key={l} label={l.toFixed(1)} selected={skillMin === l} onPress={() => setSkillMin(l)} />
          ))}
        </Row>
        <Txt variant="small" tone="textSecondary">Maximum</Txt>
        <Row wrap>
          <Chip label="Any" selected={skillMax == null} onPress={() => setSkillMax(null)} />
          {SKILL_LEVELS.map((l) => (
            <Chip key={l} label={l.toFixed(1)} selected={skillMax === l} onPress={() => setSkillMax(l)} />
          ))}
        </Row>
      </Card>

      <Card>
        <Field label="Notes for players" value={notes} onChangeText={setNotes} placeholder="Bring water, paddles available to borrow…" multiline maxLength={1000} />
      </Card>
    </Screen>
  );
}
