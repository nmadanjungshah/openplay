import { Linking, Platform } from 'react-native';

type CalendarEvent = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  location: string;
  details: string;
};

function utcStamp(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

export function googleCalendarUrl(e: CalendarEvent): string {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: e.title,
    dates: `${utcStamp(e.startsAt)}/${utcStamp(e.endsAt)}`,
    details: e.details,
    location: e.location,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function escapeIcs(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
}

export function buildIcs(e: CalendarEvent): string {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//OpenPlay//Pickleball//EN',
    'BEGIN:VEVENT',
    `UID:${e.id}@openplay`,
    `DTSTAMP:${utcStamp(new Date().toISOString())}`,
    `DTSTART:${utcStamp(e.startsAt)}`,
    `DTEND:${utcStamp(e.endsAt)}`,
    `SUMMARY:${escapeIcs(e.title)}`,
    `LOCATION:${escapeIcs(e.location)}`,
    `DESCRIPTION:${escapeIcs(e.details)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

export function openGoogleCalendar(e: CalendarEvent) {
  return Linking.openURL(googleCalendarUrl(e));
}

/** Web only: download an .ics file for Apple Calendar / Outlook. */
export function downloadIcs(e: CalendarEvent) {
  if (Platform.OS !== 'web') return;
  const blob = new Blob([buildIcs(e)], { type: 'text/calendar;charset=utf-8' });
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = `${e.title.replace(/[^\w-]+/g, '-').toLowerCase()}.ics`;
  a.click();
  URL.revokeObjectURL(href);
}

export type { CalendarEvent };
