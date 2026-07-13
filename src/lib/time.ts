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
  return format(parseISO(iso), "h:mm a");
}

export function formatDateTime(iso: string) {
  return format(parseISO(iso), "MMM d, h:mm a");
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
