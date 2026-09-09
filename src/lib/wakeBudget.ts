/**
 * Wake windows are a plan for the whole day, not three independent timers: 3 + 4 + 4 is
 * eleven hours awake. So when one stretch runs short or long, the windows still to come
 * absorb the difference in equal shares and the day still adds up to the same total.
 *
 * No imports on purpose — a copy of this file is uploaded with the notify-sleep edge
 * function so the reminders and the app predict the same times. Redeploy the function
 * when it changes.
 */

/** Adjusting can shorten a window, but never past the point of being useful. */
export const MIN_ADJUSTED_WAKE_WINDOW_HOURS = 0.25;
/**
 * Nor stretch one out of all recognition. A day of unusually short awake stretches would
 * otherwise hand the last window every hour they gave back — nobody keeps a baby up for
 * nine hours to balance the books. Past this the total stops adding up, on purpose.
 */
export const MAX_ADJUSTED_WAKE_WINDOW_MULTIPLE = 2;

export type SleepLike = { started_at: string; ended_at: string | null; is_night_sleep: boolean };

const HOUR_MS = 3600_000;

/**
 * How long he was actually awake in each stretch that has already ended, in order: from
 * the morning wake-up to the first nap, then between naps. A nap still in progress ends
 * no stretch, so it isn't counted.
 */
export function completedAwakeHours(morningWakeMs: number, sessions: SleepLike[]): number[] {
  const naps = sessions
    .filter((s) => !s.is_night_sleep && s.ended_at && Date.parse(s.started_at) >= morningWakeMs)
    .sort((a, b) => Date.parse(a.started_at) - Date.parse(b.started_at));

  const hours: number[] = [];
  let awakeSince = morningWakeMs;
  for (const nap of naps) {
    hours.push(Math.max(0, (Date.parse(nap.started_at) - awakeSince) / HOUR_MS));
    awakeSince = Date.parse(nap.ended_at!);
  }
  return hours;
}

/**
 * The wake window to go by right now: the planned one plus an equal share of whatever the
 * earlier stretches gave back or borrowed. Returns null when no windows are configured.
 */
export function adjustedWakeWindowHours(
  plannedHours: number[],
  actualAwakeHours: number[],
): number | null {
  if (plannedHours.length === 0) return null;

  const index = actualAwakeHours.length;
  // More naps than the plan has windows: the budget has nothing left to say, so the last
  // window repeats, exactly as it did before any of this arithmetic.
  if (index >= plannedHours.length) return plannedHours[plannedHours.length - 1];

  const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
  const owed = sum(plannedHours.slice(0, index)) - sum(actualAwakeHours);
  const share = owed / (plannedHours.length - index);

  const planned = plannedHours[index];
  return Math.min(
    planned * MAX_ADJUSTED_WAKE_WINDOW_MULTIPLE,
    Math.max(MIN_ADJUSTED_WAKE_WINDOW_HOURS, planned + share),
  );
}
