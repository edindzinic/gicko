import { differenceInMinutes, format, parseISO } from "date-fns";

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
