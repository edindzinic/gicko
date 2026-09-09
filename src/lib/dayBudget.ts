/**
 * The day's timings are plans for the whole day, not a row of independent timers. Wake
 * windows of 3 + 4 + 4 are eleven hours awake; nap lengths of 1.5 + 1.25 are two and
 * three quarter hours asleep. When one stretch runs short or long, the ones still to come
 * absorb the difference in equal shares and the day still adds up to the same total.
 *
 * No imports on purpose — a copy of this file is uploaded with the notify-sleep edge
 * function so the reminders and the app predict the same times. Redeploy the function
 * when it changes.
 */

/** Adjusting can shorten a stretch, but never past the point of being useful. */
export const MIN_ADJUSTED_HOURS = 0.25;
/**
 * Nor stretch one out of all recognition. A day of unusually short stretches would
 * otherwise hand the last one every hour the others gave back — nobody keeps a baby up
 * for nine hours, or in a cot for four, to balance the books. Past this the total stops
 * adding up, on purpose.
 */
export const MAX_ADJUSTED_MULTIPLE = 2;

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
 * Hours each finished nap actually lasted, in order. Used the same way as the awake
 * stretches: to see how far the day is from its planned total.
 */
export function completedNapHours(morningWakeMs: number, sessions: SleepLike[]): number[] {
  return sessions
    .filter((s) => !s.is_night_sleep && s.ended_at && Date.parse(s.started_at) >= morningWakeMs)
    .sort((a, b) => Date.parse(a.started_at) - Date.parse(b.started_at))
    .map((nap) => Math.max(0, (Date.parse(nap.ended_at!) - Date.parse(nap.started_at)) / HOUR_MS));
}

/**
 * The stretch to go by right now — the next wake window, or the length of the nap he's on
 * — as planned, plus an equal share of whatever the earlier ones gave back or borrowed.
 * Returns null when nothing is configured.
 */
export function adjustedFromPlan(
  plannedHours: number[],
  actualHours: number[],
): number | null {
  if (plannedHours.length === 0) return null;

  const index = actualHours.length;
  // More stretches than the plan plans for: the budget has nothing left to say, so the
  // last value repeats, exactly as it did before any of this arithmetic.
  if (index >= plannedHours.length) return plannedHours[plannedHours.length - 1];

  const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
  const owed = sum(plannedHours.slice(0, index)) - sum(actualHours);
  const share = owed / (plannedHours.length - index);

  const planned = plannedHours[index];
  return Math.min(
    planned * MAX_ADJUSTED_MULTIPLE,
    Math.max(MIN_ADJUSTED_HOURS, planned + share),
  );
}
