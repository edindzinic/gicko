/**
 * The wake-window budget. Run with `npm test`; named .mts so node treats it as ESM, and
 * kept out of the Next typecheck by the tsconfig exclude.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  adjustedWakeWindowHours,
  completedAwakeHours,
  MIN_ADJUSTED_WAKE_WINDOW_HOURS,
  type SleepLike,
} from "./wakeBudget.ts";

const PLAN = [3, 4, 4]; // eleven hours awake across the day
const morning = Date.parse("2026-09-09T07:00:00Z");
const nap = (start: string, end: string | null): SleepLike => ({
  started_at: new Date(start).toISOString(),
  ended_at: end && new Date(end).toISOString(),
  is_night_sleep: false,
});

test("the first window is the planned one — nothing has drifted yet", () => {
  assert.equal(adjustedWakeWindowHours(PLAN, []), 3);
});

test("a short stretch is made up by the windows still to come, equally", () => {
  // Awake 2.5h instead of 3: the missing half hour is split over the two left.
  assert.equal(adjustedWakeWindowHours(PLAN, [2.5]), 4.25);
});

test("a long stretch is taken back from the windows still to come, equally", () => {
  // Awake 3.5h instead of 3: the extra half hour comes off the two left.
  assert.equal(adjustedWakeWindowHours(PLAN, [2.5, 4.25]), 4.25);
  assert.equal(adjustedWakeWindowHours(PLAN, [3.5]), 3.75);
});

test("the worked example: 3 then 3.75 extends the last window by 15 minutes", () => {
  assert.equal(adjustedWakeWindowHours(PLAN, [3, 3.75]), 4.25);
});

test("the day still adds up to the planned total", () => {
  const actual = [2.5];
  const second = adjustedWakeWindowHours(PLAN, actual)!;
  const third = adjustedWakeWindowHours(PLAN, [...actual, second])!;
  assert.equal(actual[0] + second + third, 11);
});

test("a badly overrun day shortens what's left, down to a floor", () => {
  // Awake nine hours before the first nap: six over, split across the two left.
  assert.equal(adjustedWakeWindowHours(PLAN, [9]), 1);
  // Far enough over and the arithmetic would go negative, which is no use to anyone.
  assert.equal(adjustedWakeWindowHours(PLAN, [12]), MIN_ADJUSTED_WAKE_WINDOW_HOURS);
});

test("an unusually short day stretches what's left, up to a ceiling", () => {
  // Awake only an hour before the first nap: two hours owed, split over the two left.
  assert.equal(adjustedWakeWindowHours(PLAN, [1]), 5);
  // Owed so much that a window would more than double, which nobody would act on.
  assert.equal(adjustedWakeWindowHours(PLAN, [0.5, 0.5]), 8);
});

test("more naps than windows falls back to repeating the last one", () => {
  assert.equal(adjustedWakeWindowHours(PLAN, [3, 4, 4]), 4);
  assert.equal(adjustedWakeWindowHours(PLAN, [3, 4, 4, 1]), 4);
});

test("no windows configured means no window", () => {
  assert.equal(adjustedWakeWindowHours([], [3]), null);
});

test("awake stretches run from the morning wake to each nap, then between naps", () => {
  const sessions = [
    nap("2026-09-09T10:00:00Z", "2026-09-09T11:00:00Z"),
    nap("2026-09-09T14:45:00Z", "2026-09-09T15:30:00Z"),
  ];
  assert.deepEqual(completedAwakeHours(morning, sessions), [3, 3.75]);
});

test("a nap in progress ends no stretch, and yesterday's naps count for nothing", () => {
  const sessions = [
    nap("2026-09-08T13:00:00Z", "2026-09-08T14:00:00Z"),
    nap("2026-09-09T10:00:00Z", "2026-09-09T11:00:00Z"),
    nap("2026-09-09T14:45:00Z", null),
  ];
  assert.deepEqual(completedAwakeHours(morning, sessions), [3]);
});
