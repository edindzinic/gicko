/**
 * When each reminder is due. Pure date arithmetic, no dependencies — the runtime bits
 * live in index.ts, and schedule.test.ts exercises this file directly with `npm test`.
 */
const SLEEP_LEAD_MINUTES = 10;
const WAKE_LEAD_MINUTES = 5;
/** A feeding reminder stays useful for a while after the moment it names. */
const FEEDING_TTL_SECONDS = 30 * 60;
/** Used when feeding_settings has no row yet. */
export const DEFAULT_FEEDING_INTERVAL_HOURS = 1.5;
/** Naps are counted from here when no night sleep is on record — enough to cover a day. */
const FALLBACK_MORNING_HOURS = 14;

export type Kind = "nap_due" | "bedtime_due" | "nap_end" | "feeding_due" | "test";

export type Session = {
  id: string;
  started_at: string;
  ended_at: string | null;
  is_night_sleep: boolean;
};

export type Feeding = { id: string; occurred_at: string };

/** The configured timings a reminder is measured against, straight from Settings. */
export type Schedule = {
  /** How long he stays awake before each nap, in order; the last value repeats. */
  wakeWindowHours: number[];
  /** How long each nap should run, in order; the last value repeats. */
  napDurationHours: number[];
  /** How long after a feeding the next one is due. */
  feedingIntervalHours: number;
};

export type Due = {
  kind: Exclude<Kind, "test">;
  dedupeKey: string;
  targetAt: Date;
  ttlSeconds: number;
};

function latestBy(sessions: Session[], pick: (s: Session) => number) {
  return sessions.reduce<Session | null>(
    (latest, s) => (!latest || pick(s) > pick(latest) ? s : latest),
    null,
  );
}

/**
 * Every reminder with a moment attached, whether or not that moment has arrived — the
 * caller decides what's close enough to send. A feeding and a nap can fall due together,
 * which is why this is a list.
 *
 * The nap index rule mirrors completedNapsSinceWake in src/app/(app)/page.tsx: naps
 * already finished since this morning's wake-up, with the last configured value repeating
 * for any nap after the list runs out.
 */
export function computeDue(
  now: Date,
  sessions: Session[],
  feedings: Feeding[],
  { wakeWindowHours, napDurationHours, feedingIntervalHours }: Schedule,
): Due[] {
  const due: Due[] = [];
  const open = latestBy(
    sessions.filter((s) => !s.ended_at),
    (s) => Date.parse(s.started_at),
  );
  const ended = sessions.filter((s) => s.ended_at);
  const lastEnded = latestBy(ended, (s) => Date.parse(s.ended_at!));
  const lastNight = latestBy(
    ended.filter((s) => s.is_night_sleep),
    (s) => Date.parse(s.ended_at!),
  );

  const morningWake = lastNight
    ? Date.parse(lastNight.ended_at!)
    : now.getTime() - FALLBACK_MORNING_HOURS * 3600_000;
  const completedNaps = ended.filter(
    (s) => !s.is_night_sleep && Date.parse(s.started_at) >= morningWake,
  ).length;

  // Asleep: the nap's own end is the only thing worth announcing. Night sleep has none —
  // the morning is when it's over.
  if (open) {
    if (!open.is_night_sleep && napDurationHours.length > 0) {
      const hours = napDurationHours[Math.min(completedNaps, napDurationHours.length - 1)];
      due.push({
        kind: "nap_end",
        dedupeKey: open.id,
        targetAt: new Date(
          Date.parse(open.started_at) + hours * 3600_000 - WAKE_LEAD_MINUTES * 60_000,
        ),
        ttlSeconds: WAKE_LEAD_MINUTES * 60,
      });
    }
    // Nothing else while he sleeps: a feeding reminder would be asking someone to wake
    // him, and the wake window hasn't started.
    return due;
  }

  if (lastEnded && wakeWindowHours.length > 0) {
    const hours = wakeWindowHours[Math.min(completedNaps, wakeWindowHours.length - 1)];
    const isBedtime = completedNaps >= wakeWindowHours.length - 1;
    due.push({
      kind: isBedtime ? "bedtime_due" : "nap_due",
      dedupeKey: lastEnded.id,
      targetAt: new Date(
        Date.parse(lastEnded.ended_at!) + hours * 3600_000 - SLEEP_LEAD_MINUTES * 60_000,
      ),
      ttlSeconds: SLEEP_LEAD_MINUTES * 60,
    });
  }

  const lastFeeding = feedings.reduce<Feeding | null>(
    (latest, f) =>
      !latest || Date.parse(f.occurred_at) > Date.parse(latest.occurred_at) ? f : latest,
    null,
  );

  // The cycle only starts once the day's first feeding is logged. A feed during the night
  // doesn't start it, so waking up in the morning never comes with a reminder attached.
  if (lastFeeding && Date.parse(lastFeeding.occurred_at) > morningWake) {
    const interval = Date.parse(lastFeeding.occurred_at) + feedingIntervalHours * 3600_000;
    // If it came due while he was asleep it waits for him: the reminder lands when the
    // nap it fell inside is logged as over.
    const wokeAt = lastEnded ? Date.parse(lastEnded.ended_at!) : interval;
    due.push({
      kind: "feeding_due",
      dedupeKey: lastFeeding.id,
      targetAt: new Date(Math.max(interval, wokeAt)),
      ttlSeconds: FEEDING_TTL_SECONDS,
    });
  }

  return due;
}
