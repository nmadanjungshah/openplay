export const SKILL_LEVELS = [2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 5.5];

const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
const timeFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });

export function formatDay(iso: string | Date): string {
  return dayFmt.format(new Date(iso));
}

export function formatTime(iso: string | Date): string {
  return timeFmt.format(new Date(iso));
}

export function formatSlot(startsAt: string, endsAt: string): string {
  return `${formatDay(startsAt)} · ${formatTime(startsAt)}–${formatTime(endsAt)}`;
}

/** "Today", "Tomorrow", or the weekday/date. */
export function relativeDay(iso: string | Date): string {
  const d = new Date(iso);
  const today = startOfDay(new Date());
  const diff = Math.round((startOfDay(d).getTime() - today.getTime()) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return formatDay(d);
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function formatNpr(amount: number): string {
  if (amount === 0) return 'Free';
  return `Rs ${amount.toLocaleString('en-IN')}`;
}

export function skillRange(min: number | null, max: number | null): string | null {
  if (min == null && max == null) return null;
  if (min != null && max != null) return min === max ? `${min.toFixed(1)}` : `${min.toFixed(1)}–${max.toFixed(1)}`;
  if (min != null) return `${min.toFixed(1)}+`;
  return `up to ${max!.toFixed(1)}`;
}

/** Parse "18:30" / "6:30" into [hours, minutes], or null if invalid. */
export function parseTime(value: string): [number, number] | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return [h, min];
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}
