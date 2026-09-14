/**
 * The rest of the day, projected: the stretch he's on, then every nap and wake window
 * still to come, ending at bedtime.
 *
 * It walks the same day budget the status card and the reminders use, one stretch at a
 * time, feeding each projected length back in as though it had already happened. So the
 * projection drifts exactly the way the real day does — a nap that runs long shortens
 * the windows after it here too — and the times on the timeline can't disagree with the
 * time on the card.
 */
import { adjustedFromPlan } from "./dayBudget.ts";

const HOUR_MS = 3600_000;

/** A malformed plan shouldn't project for ever. A real day needs a fraction of these. */
const MAX_SEGMENTS = 24;

export type ForecastSegment = {
  kind: "awake" | "nap";
  startMs: number;
  endMs: number;
  /** True on the awake stretch that closes the day: what follows it is bedtime, not a nap. */
  endsAtBedtime: boolean;
};

export function forecastRestOfDay({
  anchorMs,
  asleep,
  wakeWindowPlan,
  napPlan,
  awakeSoFar,
  napsSoFar,
}: {
  /** When the stretch in progress began — the current nap's start, or the last wake-up. */
  anchorMs: number;
  /** Whether that stretch is a nap rather than a wake window. */
  asleep: boolean;
  wakeWindowPlan: number[];
  napPlan: number[];
  /** Wake windows already completed today, in order, as `completedAwakeHours` gives them. */
  awakeSoFar: number[];
  /** Naps already completed today, in order. */
  napsSoFar: number[];
}): ForecastSegment[] {
  // Without wake windows there is no shape to the day and nothing to predict.
  if (wakeWindowPlan.length === 0) return [];

  const segments: ForecastSegment[] = [];
  const awake = [...awakeSoFar];
  const naps = [...napsSoFar];
  let cursor = anchorMs;
  let sleeping = asleep;

  while (segments.length < MAX_SEGMENTS) {
    if (sleeping) {
      const hours = adjustedFromPlan(napPlan, naps);
      // No nap lengths configured: the naps can't be placed, so the day ends here rather
      // than guessing at one.
      if (hours == null) break;
      const endMs = cursor + hours * HOUR_MS;
      segments.push({ kind: "nap", startMs: cursor, endMs, endsAtBedtime: false });
      naps.push(hours);
      cursor = endMs;
      sleeping = false;
      continue;
    }

    const hours = adjustedFromPlan(wakeWindowPlan, awake);
    if (hours == null) break;
    const endMs = cursor + hours * HOUR_MS;
    // One window leads to each nap, and the last one leads to bedtime.
    const endsAtBedtime = awake.length >= wakeWindowPlan.length - 1;
    segments.push({ kind: "awake", startMs: cursor, endMs, endsAtBedtime });
    if (endsAtBedtime) break;
    awake.push(hours);
    cursor = endMs;
    sleeping = true;
  }

  return segments;
}
