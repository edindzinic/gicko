/**
 * The rest of the day, projected. Run with `npm test`; named .mts so node treats it as
 * ESM, and kept out of the Next typecheck by the tsconfig exclude.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { awakeHoursSpent, forecastRestOfDay, type ForecastSegment } from "./dayForecast.ts";

const PLAN = [3, 4, 4]; // eleven hours awake, so three windows and two naps
const NAP_PLAN = [1.5, 1.25]; // two and three quarter hours asleep
const HOUR_MS = 3600_000;

const at = (iso: string) => Date.parse(iso);
const morning = at("2026-09-09T07:00:00Z");

/** `kind@start–end`, so a whole day reads as one list. */
const shape = (segments: ForecastSegment[]) =>
  segments.map((s) => `${s.kind} ${clock(s.startMs)}–${clock(s.endMs)}`);

const clock = (ms: number) => new Date(ms).toISOString().slice(11, 16);

const fromMorning = (overrides: Partial<Parameters<typeof forecastRestOfDay>[0]> = {}) =>
  forecastRestOfDay({
    anchorMs: morning,
    asleep: false,
    wakeWindowPlan: PLAN,
    napPlan: NAP_PLAN,
    awakeSoFar: [],
    napsSoFar: [],
    ...overrides,
  });

test("a fresh morning projects every window and nap through to bedtime", () => {
  assert.deepEqual(shape(fromMorning()), [
    "awake 07:00–10:00",
    "nap 10:00–11:30",
    "awake 11:30–15:30",
    "nap 15:30–16:45",
    "awake 16:45–20:45",
  ]);
});

test("the last stretch is the one that ends at bedtime, and only it", () => {
  const segments = fromMorning();
  assert.deepEqual(
    segments.map((s) => s.endsAtBedtime),
    [false, false, false, false, true],
  );
});

test("a nap in progress is the first stretch, and the day carries on from its end", () => {
  // Down for the second nap at 15:45, a quarter hour later than planned.
  const segments = forecastRestOfDay({
    anchorMs: at("2026-09-09T15:45:00Z"),
    asleep: true,
    wakeWindowPlan: PLAN,
    napPlan: NAP_PLAN,
    awakeSoFar: [3, 4.25],
    napsSoFar: [1.5],
  });
  assert.deepEqual(shape(segments), ["nap 15:45–17:00", "awake 17:00–20:45"]);
});

test("drift is absorbed, so the day still reaches the same bedtime", () => {
  // He stayed up an hour past the first nap, then slept the planned hour and a half.
  // What's left shortens to make the hour up, and bedtime lands where it always was —
  // which is the whole point of running the prediction through the budget.
  const drifted = forecastRestOfDay({
    anchorMs: morning + 5.5 * HOUR_MS, // awake again at 12:30
    asleep: false,
    wakeWindowPlan: PLAN,
    napPlan: NAP_PLAN,
    awakeSoFar: [4],
    napsSoFar: [1.5],
  });

  assert.deepEqual(shape(drifted), [
    "awake 12:30–16:00",
    "nap 16:00–17:15",
    "awake 17:15–20:45",
  ]);
  assert.equal(clock(fromMorning().at(-1)!.endMs), clock(drifted.at(-1)!.endMs));
});

test("more naps than the plan planned for still ends the day, rather than looping", () => {
  const segments = fromMorning({ awakeSoFar: [3, 4, 4, 4], napsSoFar: [1.5, 1.25, 1.25, 1.25] });
  assert.deepEqual(
    segments.map((s) => s.kind),
    ["awake"],
  );
  assert.equal(segments[0].endsAtBedtime, true);
});

test("no wake windows means no prediction at all", () => {
  assert.deepEqual(fromMorning({ wakeWindowPlan: [] }), []);
});

test("no nap lengths predicts the window he's in and stops, rather than guessing a nap", () => {
  assert.deepEqual(shape(fromMorning({ napPlan: [] })), ["awake 07:00–10:00"]);
});

test("a single wake window is the whole day: wake, then bedtime", () => {
  assert.deepEqual(shape(fromMorning({ wakeWindowPlan: [12] })), ["awake 07:00–19:00"]);
});

// The real day this was reported against: three windows, so two naps.
const REAL_PLAN = [3, 3.75, 4];
const REAL_NAP_PLAN = [1.25, 0.75];
const nap = (start: string, end: string | null) => ({
  started_at: new Date(start).toISOString(),
  ended_at: end && new Date(end).toISOString(),
  is_night_sleep: false,
});

test("the window before the nap he's on counts as spent, not still to come", () => {
  // Awake 07:00–10:00, nap 10:00–11:15, awake 11:15–15:00, and down for the second nap.
  const sessions = [nap("2026-09-09T10:00:00Z", "2026-09-09T11:15:00Z"), nap("2026-09-09T15:00:00Z", null)];
  assert.deepEqual(awakeHoursSpent(morning, sessions, at("2026-09-09T15:00:00Z")), [3, 3.75]);
});

test("with no nap in progress it is just the stretches that have ended", () => {
  const sessions = [nap("2026-09-09T10:00:00Z", "2026-09-09T11:15:00Z")];
  assert.deepEqual(awakeHoursSpent(morning, sessions, null), [3]);
});

test("the second nap of a two-nap day is the last: bedtime follows it", () => {
  const sessions = [nap("2026-09-09T10:00:00Z", "2026-09-09T11:15:00Z"), nap("2026-09-09T15:00:00Z", null)];
  const segments = forecastRestOfDay({
    anchorMs: at("2026-09-09T15:00:00Z"),
    asleep: true,
    wakeWindowPlan: REAL_PLAN,
    napPlan: REAL_NAP_PLAN,
    awakeSoFar: awakeHoursSpent(morning, sessions, at("2026-09-09T15:00:00Z")),
    napsSoFar: [1.25],
  });
  assert.deepEqual(shape(segments), ["nap 15:00–15:45", "awake 15:45–19:45"]);
  assert.equal(segments.at(-1)?.endsAtBedtime, true);
});
