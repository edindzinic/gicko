import { addDays, addHours, differenceInMinutes, format, parseISO, startOfDay, subDays } from "date-fns";

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

export type NightSleepLike = { started_at: string; ended_at: string | null; is_night_sleep: boolean };

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

export type NightWakeUp = { wokeAt: string; backAsleepAt: string; awakeMinutes: number };

/**
 * Same detection as findNightWakeUpEndTimes, but returns the full picture of each
 * wake-up — when the baby woke, when they went back down, and how long they were up.
 */
export function findNightWakeUps(sessions: NightSleepLike[]): NightWakeUp[] {
  const nights = sessions
    .filter((s): s is NightSleepLike & { ended_at: string } => s.is_night_sleep && !!s.ended_at)
    .sort((a, b) => parseISO(a.started_at).getTime() - parseISO(b.started_at).getTime());

  const wakeUps: NightWakeUp[] = [];
  for (let i = 0; i < nights.length - 1; i++) {
    const current = nights[i];
    const next = nights[i + 1];
    const gapMinutes = differenceInMinutes(parseISO(next.started_at), parseISO(current.ended_at));
    if (gapMinutes >= 0 && gapMinutes <= 180) {
      wakeUps.push({
        wokeAt: current.ended_at,
        backAsleepAt: next.started_at,
        awakeMinutes: gapMinutes,
      });
    }
  }
  return wakeUps;
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

const NIGHT_ATTRIBUTION_CUTOFF_HOUR = 17; // 5pm — night sleep starting after this belongs to the next day's stats

/**
 * Computes day-view stats that don't line up with calendar-day boundaries:
 * - nightSleepMinutes: total night sleep "attributed" to this day, i.e. the sleep from
 *   last night — including the portion that started after 5pm the previous day.
 * - dayAwakeMinutes: awake time during the day only (from this morning's wake-up to
 *   tonight's bedtime), excluding any awake gaps between last night's wake-ups.
 * - napMinutes: total non-night sleep during that same daytime window.
 *
 * `nightSessions` must be unscoped by day (all is_night_sleep rows) so a chain that ends
 * before midnight — and so wouldn't otherwise overlap this calendar day at all — is still
 * found. `daySessions` (this day's naps + night sessions) supplies the naps.
 * `asOf` should be the current time when viewing today, or end-of-day when viewing a past day.
 */
export function computeDayStats(
  day: string,
  nightSessions: NightSleepLike[],
  daySessions: NightSleepLike[],
  asOf: Date,
) {
  const dayStart = startOfDay(parseISO(`${day}T00:00:00`));
  const prevEveningCutoff = addHours(subDays(dayStart, 1), NIGHT_ATTRIBUTION_CUTOFF_HOUR);
  const tonightCutoff = addHours(dayStart, NIGHT_ATTRIBUTION_CUTOFF_HOUR);

  const nightChain = nightSessions
    .filter((s) => {
      const start = parseISO(s.started_at);
      return start >= prevEveningCutoff && start < tonightCutoff;
    })
    .sort((a, b) => parseISO(a.started_at).getTime() - parseISO(b.started_at).getTime());

  const nightSleepMinutes = nightChain.reduce(
    (sum, s) => sum + sessionDurationMinutes(s.started_at, s.ended_at),
    0,
  );

  const lastNightSession = nightChain[nightChain.length - 1];
  const morningWake = lastNightSession
    ? lastNightSession.ended_at
      ? parseISO(lastNightSession.ended_at)
      : null // still asleep from last night — the day hasn't started yet
    : dayStart; // no prior night on record — treat the day as starting at midnight

  const nextEveningCutoff = addHours(dayStart, 24 + NIGHT_ATTRIBUTION_CUTOFF_HOUR);
  const tonightSession = nightSessions
    .filter((s) => {
      const start = parseISO(s.started_at);
      return start >= tonightCutoff && start < nextEveningCutoff;
    })
    .sort((a, b) => parseISO(a.started_at).getTime() - parseISO(b.started_at).getTime())[0];

  const dayPeriodEnd = tonightSession ? parseISO(tonightSession.started_at) : asOf;
  const dayPeriodStart = morningWake ?? dayPeriodEnd;
  const totalDayMinutes = morningWake
    ? Math.max(0, differenceInMinutes(dayPeriodEnd, dayPeriodStart))
    : 0;

  const napMinutes = daySessions
    .filter((s) => !s.is_night_sleep)
    .reduce((sum, s) => {
      if (!morningWake) return sum;
      const segStart = parseISO(s.started_at) < dayPeriodStart ? dayPeriodStart : parseISO(s.started_at);
      const segEndRaw = s.ended_at ? parseISO(s.ended_at) : asOf;
      const segEnd = segEndRaw > dayPeriodEnd ? dayPeriodEnd : segEndRaw;
      if (segEnd <= segStart) return sum;
      return sum + differenceInMinutes(segEnd, segStart);
    }, 0);

  const dayAwakeMinutes = Math.max(0, totalDayMinutes - napMinutes);

  return { nightSleepMinutes, dayAwakeMinutes, napMinutes };
}
