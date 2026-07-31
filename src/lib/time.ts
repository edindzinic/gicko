import { addDays, addHours, differenceInMinutes, format, parseISO, startOfDay, subDays } from "date-fns";

const NIGHT_START_HOUR = 19; // 7pm
const NIGHT_END_HOUR = 7; // 7am

export function isNightTime(iso: string) {
  const hour = parseISO(iso).getHours();
  return hour >= NIGHT_START_HOUR || hour < NIGHT_END_HOUR;
}

export function formatDuration(minutes: number) {
  const total = Math.round(minutes);
  const h = Math.floor(total / 60);
  const m = total % 60;
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

export type NightWakeUp = {
  id: string;
  wokeAt: string;
  backAsleepAt: string | null;
  awakeMinutes: number;
};

export type NightWakingLike = { id: string; started_at: string; ended_at: string | null };

/** Night wakings in the order they happened, with how long each one lasted. */
export function collectNightWakeUps(wakings: NightWakingLike[]): NightWakeUp[] {
  return wakings
    .map((w) => ({
      id: w.id,
      wokeAt: w.started_at,
      backAsleepAt: w.ended_at,
      awakeMinutes: Math.max(
        0,
        differenceInMinutes(w.ended_at ? parseISO(w.ended_at) : new Date(), parseISO(w.started_at)),
      ),
    }))
    .sort((a, b) => parseISO(a.wokeAt).getTime() - parseISO(b.wokeAt).getTime());
}

/** Minutes two intervals overlap by. */
function overlapMinutes(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  const start = aStart > bStart ? aStart : bStart;
  const end = aEnd < bEnd ? aEnd : bEnd;
  return end > start ? differenceInMinutes(end, start) : 0;
}

/**
 * A sleep session's duration with any night wakings inside it taken out — a waking
 * leaves the session open, so its awake time would otherwise count as sleep.
 */
export function sleepMinutesExcludingWakings(
  session: { started_at: string; ended_at: string | null },
  wakings: NightWakingLike[],
  asOf: Date = new Date(),
) {
  const sessionStart = parseISO(session.started_at);
  const sessionEnd = session.ended_at ? parseISO(session.ended_at) : asOf;
  const slept = Math.max(0, differenceInMinutes(sessionEnd, sessionStart));
  const awake = wakings.reduce(
    (sum, w) =>
      sum +
      overlapMinutes(
        parseISO(w.started_at),
        w.ended_at ? parseISO(w.ended_at) : asOf,
        sessionStart,
        sessionEnd,
      ),
    0,
  );
  return Math.max(0, slept - awake);
}

/**
 * The day a night-time event counts toward. Night stats are attributed to the morning
 * the night ends on, so an event after the evening cutoff belongs to the next day —
 * a 23:46 waking is part of the night you wake up from tomorrow morning.
 */
export function nightAttributionDay(iso: string) {
  const at = parseISO(iso);
  return format(
    at.getHours() >= NIGHT_ATTRIBUTION_CUTOFF_HOUR ? addDays(at, 1) : at,
    "yyyy-MM-dd",
  );
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
  nightWakings: NightWakingLike[] = [],
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

  // A night waking doesn't end the sleep session, so its awake time is still inside the
  // session's span and has to come back out of the night-sleep total.
  const nightSleepMinutes = nightChain.reduce(
    (sum, s) => sum + sleepMinutesExcludingWakings(s, nightWakings, asOf),
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

  return { nightSleepMinutes, dayAwakeMinutes, napMinutes, morningWake };
}
