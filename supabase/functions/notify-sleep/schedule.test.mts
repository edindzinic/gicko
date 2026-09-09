/**
 * Scenarios for computeDue. These reminders fire while nobody is watching — often in the
 * middle of the night — so the timing rules are pinned down here instead.
 *
 * Run with `npm test`. Named .mts so node treats it as ESM without the repo needing
 * to declare a module type.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeDue, type Due, type Feeding, type Schedule, type Session } from "./schedule.ts";

const SETTINGS: Schedule = {
  wakeWindowHours: [3, 3.75, 4.25],
  napDurationHours: [1.5, 1.25],
  feedingIntervalHours: 1.5,
};

const at = (time: string) => new Date(time).toISOString();
const night = (start: string, end: string | null): Session => ({
  id: "night",
  started_at: at(start),
  ended_at: end && at(end),
  is_night_sleep: true,
});
const nap = (id: string, start: string, end: string | null): Session => ({
  id,
  started_at: at(start),
  ended_at: end && at(end),
  is_night_sleep: false,
});
const feeding = (id: string, time: string): Feeding => ({ id, occurred_at: at(time) });

const NOW = new Date("2026-09-09T12:00:00Z");
/** Slept 19:00, up at 07:00 — the anchor the day's naps and feeds are counted from. */
const LAST_NIGHT = night("2026-09-08T19:00:00Z", "2026-09-09T07:00:00Z");

function due(sessions: Session[], feedings: Feeding[] = [], now = NOW) {
  return computeDue(now, sessions, feedings, SETTINGS);
}
function shape(items: Due[]) {
  return items.map((d) => ({ kind: d.kind, target: d.targetAt.toISOString(), key: d.dedupeKey }));
}
const only = (items: Due[], kind: string) => shape(items.filter((d) => d.kind === kind));

test("awake with no naps yet counts down the first wake window", () => {
  assert.deepEqual(only(due([LAST_NIGHT]), "nap_due"), [
    { kind: "nap_due", target: "2026-09-09T09:50:00.000Z", key: "night" },
  ]);
});

test("each finished nap moves on to the next wake window", () => {
  const sessions = [LAST_NIGHT, nap("n1", "2026-09-09T10:00:00Z", "2026-09-09T11:00:00Z")];
  assert.deepEqual(only(due(sessions), "nap_due"), [
    { kind: "nap_due", target: "2026-09-09T14:35:00.000Z", key: "n1" },
  ]);
});

test("the last wake window of the day is bedtime, and it repeats", () => {
  const two = [
    LAST_NIGHT,
    nap("n1", "2026-09-09T08:00:00Z", "2026-09-09T09:00:00Z"),
    nap("n2", "2026-09-09T10:00:00Z", "2026-09-09T11:00:00Z"),
  ];
  assert.deepEqual(only(due(two), "bedtime_due"), [
    { kind: "bedtime_due", target: "2026-09-09T15:05:00.000Z", key: "n2" },
  ]);

  const three = [...two, nap("n3", "2026-09-09T11:10:00Z", "2026-09-09T11:30:00Z")];
  assert.deepEqual(only(due(three), "bedtime_due"), [
    { kind: "bedtime_due", target: "2026-09-09T15:35:00.000Z", key: "n3" },
  ]);
});

test("a nap in progress announces its own end and nothing else", () => {
  const sessions = [LAST_NIGHT, nap("open", "2026-09-09T11:40:00Z", null)];
  assert.deepEqual(shape(due(sessions, [feeding("f1", "2026-09-09T11:00:00Z")])), [
    { kind: "nap_end", target: "2026-09-09T13:05:00.000Z", key: "open" },
  ]);
});

test("the second nap uses the second nap length", () => {
  const sessions = [
    LAST_NIGHT,
    nap("n1", "2026-09-09T08:00:00Z", "2026-09-09T09:00:00Z"),
    nap("open", "2026-09-09T11:40:00Z", null),
  ];
  assert.deepEqual(only(due(sessions), "nap_end"), [
    { kind: "nap_end", target: "2026-09-09T12:50:00.000Z", key: "open" },
  ]);
});

test("night sleep in progress stays completely quiet", () => {
  const sessions = [night("2026-09-08T19:00:00Z", null)];
  assert.deepEqual(due(sessions, [feeding("f1", "2026-09-09T02:00:00Z")]), []);
});

test("unconfigured settings mean no reminder of that kind", () => {
  const napping = [LAST_NIGHT, nap("open", "2026-09-09T11:40:00Z", null)];
  assert.deepEqual(computeDue(NOW, napping, [], { ...SETTINGS, napDurationHours: [] }), []);
  assert.deepEqual(computeDue(NOW, [LAST_NIGHT], [], { ...SETTINGS, wakeWindowHours: [] }), []);
  assert.deepEqual(due([]), []);
});

test("yesterday's naps do not count against today", () => {
  const sessions = [
    nap("old1", "2026-09-08T09:00:00Z", "2026-09-08T10:00:00Z"),
    nap("old2", "2026-09-08T13:00:00Z", "2026-09-08T14:00:00Z"),
    LAST_NIGHT,
  ];
  assert.deepEqual(only(due(sessions), "nap_due"), [
    { kind: "nap_due", target: "2026-09-09T09:50:00.000Z", key: "night" },
  ]);
});

test("a feeding is due an hour and a half after the last one", () => {
  assert.deepEqual(only(due([LAST_NIGHT], [feeding("f1", "2026-09-09T10:30:00Z")]), "feeding_due"), [
    { kind: "feeding_due", target: "2026-09-09T12:00:00.000Z", key: "f1" },
  ]);
});

test("a newer feeding restarts the clock", () => {
  const feedings = [feeding("f1", "2026-09-09T07:30:00Z"), feeding("f2", "2026-09-09T10:15:00Z")];
  assert.deepEqual(only(due([LAST_NIGHT], feedings), "feeding_due"), [
    { kind: "feeding_due", target: "2026-09-09T11:45:00.000Z", key: "f2" },
  ]);
});

test("waking from the night is quiet: a night feed doesn't start the cycle", () => {
  const feedings = [feeding("night-feed", "2026-09-09T04:00:00Z")];
  assert.deepEqual(only(due([LAST_NIGHT], feedings), "feeding_due"), []);
  assert.deepEqual(only(due([LAST_NIGHT], []), "feeding_due"), []);
});

test("a feeding that comes due mid-nap waits for the end of it", () => {
  const sessions = [LAST_NIGHT, nap("n1", "2026-09-09T10:00:00Z", "2026-09-09T11:20:00Z")];
  assert.deepEqual(only(due(sessions, [feeding("f1", "2026-09-09T09:00:00Z")]), "feeding_due"), [
    { kind: "feeding_due", target: "2026-09-09T11:20:00.000Z", key: "f1" },
  ]);
});

test("the feeding interval comes from settings", () => {
  const feedings = [feeding("f1", "2026-09-09T10:30:00Z")];
  const twoHours = computeDue(NOW, [LAST_NIGHT], feedings, {
    ...SETTINGS,
    feedingIntervalHours: 2,
  });
  assert.deepEqual(only(twoHours, "feeding_due"), [
    { kind: "feeding_due", target: "2026-09-09T12:30:00.000Z", key: "f1" },
  ]);

  const fortyFiveMinutes = computeDue(NOW, [LAST_NIGHT], feedings, {
    ...SETTINGS,
    feedingIntervalHours: 0.75,
  });
  assert.deepEqual(only(fortyFiveMinutes, "feeding_due"), [
    { kind: "feeding_due", target: "2026-09-09T11:15:00.000Z", key: "f1" },
  ]);
});

test("a nap and a feeding can fall due together", () => {
  const items = computeDue(
    new Date("2026-09-09T10:00:00Z"),
    [LAST_NIGHT],
    [feeding("f1", "2026-09-09T08:20:00Z")],
    SETTINGS,
  );
  assert.deepEqual(shape(items), [
    { kind: "nap_due", target: "2026-09-09T09:50:00.000Z", key: "night" },
    { kind: "feeding_due", target: "2026-09-09T09:50:00.000Z", key: "f1" },
  ]);
});
