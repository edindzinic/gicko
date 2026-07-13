import { addDays, differenceInMinutes, format, parseISO, startOfDay } from "date-fns";

const NIGHT_START_HOUR = 19; // 7pm
const NIGHT_END_HOUR = 7; // 7am

export function isNightTime(iso: string) {
  const hour = parseISO(iso).getHours();
  return hour >= NIGHT_START_HOUR || hour < NIGHT_END_HOUR;
}

export function formatDuration(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h <= 0) return `${m}m`;
  if (m <= 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function sessionDurationMinutes(startedAt: string, endedAt: string | null) {
  const end = endedAt ? parseISO(endedAt) : new Date();
  return Math.max(0, differenceInMinutes(end, parseISO(startedAt)));
}

export function formatTime(iso: string) {
  return format(parseISO(iso), "HH:mm");
}

export function formatDateTime(iso: string) {
  return format(parseISO(iso), "MMM d, HH:mm");
}

export function formatHourLabel(hour: number) {
  return `${String(hour % 24).padStart(2, "0")}:00`;
}

export function toDatetimeLocalValue(iso: string | Date) {
  const date = typeof iso === "string" ? parseISO(iso) : iso;
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16);
}

export function toDateInputValue(iso: string | Date) {
  const date = typeof iso === "string" ? parseISO(iso) : iso;
  return format(date, "yyyy-MM-dd");
}

export function toTimeInputValue(iso: string | Date) {
  const date = typeof iso === "string" ? parseISO(iso) : iso;
  return format(date, "HH:mm");
}

export function combineDateAndTime(dateStr: string, timeStr: string) {
  return new Date(`${dateStr}T${timeStr}`);
}

export function minutesSinceMidnight(iso: string) {
  const date = parseISO(iso);
  return differenceInMinutes(date, startOfDay(date));
}

type NightSleepLike = { started_at: string; ended_at: string | null; is_night_sleep: boolean };

/**
 * Returns the ended_at timestamps that represent a true night wake-up —
 * i.e. the baby went back to sleep afterward — excluding the final
 * awakening of each night (the "morning awakening", which ends the
 * night for good rather than being followed by more sleep).
 */
export function findNightWakeUpEndTimes(sessions: NightSleepLike[]): string[] {
  const nights = sessions
    .filter((s): s is NightSleepLike & { ended_at: string } => s.is_night_sleep && !!s.ended_at)
    .sort((a, b) => parseISO(a.started_at).getTime() - parseISO(b.started_at).getTime());

  const wakeUpEnds: string[] = [];
  for (let i = 0; i < nights.length - 1; i++) {
    const current = nights[i];
    const next = nights[i + 1];
    const gapMinutes = differenceInMinutes(parseISO(next.started_at), parseISO(current.ended_at));
    if (gapMinutes >= 0 && gapMinutes <= 180) {
      wakeUpEnds.push(current.ended_at);
    }
  }
  return wakeUpEnds;
}

export type DaySegment = { day: string; startMinutes: number; endMinutes: number };

/** Splits a (possibly overnight) interval into one segment per calendar day it touches. */
export function splitIntervalByDay(startedAt: string, endedAt: string | null): DaySegment[] {
  const start = parseISO(startedAt);
  const end = endedAt ? parseISO(endedAt) : new Date();
  if (end <= start) return [];

  const segments: DaySegment[] = [];
  let cursor = start;
  while (cursor < end) {
    const nextMidnight = startOfDay(addDays(cursor, 1));
    const segmentEnd = end < nextMidnight ? end : nextMidnight;
    segments.push({
      day: format(cursor, "yyyy-MM-dd"),
      startMinutes: differenceInMinutes(cursor, startOfDay(cursor)),
      endMinutes: differenceInMinutes(segmentEnd, startOfDay(cursor)),
    });
    cursor = segmentEnd;
  }
  return segments;
}
