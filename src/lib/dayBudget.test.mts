/**
 * The day's budget: wake windows and nap lengths both. Run with `npm test`; named .mts so
 * node treats it as ESM, and kept out of the Next typecheck by the tsconfig exclude.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  adjustedFromPlan,
  completedAwakeHours,
  completedNapHours,
  MIN_ADJUSTED_HOURS,
  type SleepLike,
} from "./dayBudget.ts";

const PLAN = [3, 4, 4]; // eleven hours awake across the day
const NAP_PLAN = [1.5, 1.25]; // two and three quarter hours asleep across the day
const morning = Date.parse("2026-09-09T07:00:00Z");
const nap = (start: string, end: string | null): SleepLike => ({
  started_at: new Date(start).toISOString(),
  ended_at: end && new Date(end).toISOString(),
  is_night_sleep: false,
});

test("the first window is the planned one — nothing has drifted yet", () => {
  assert.equal(adjustedFromPlan(PLAN, []), 3);
});

test("a short stretch is made up by the windows still to come, equally", () => {
  // Awake 2.5h instead of 3: the missing half hour is split over the two left.
  assert.equal(adjustedFromPlan(PLAN, [2.5]), 4.25);
});

test("a long stretch is taken back from the windows still to come, equally", () => {
  // Awake 3.5h instead of 3: the extra half hour comes off the two left.
  assert.equal(adjustedFromPlan(PLAN, [2.5, 4.25]), 4.25);
  assert.equal(adjustedFromPlan(PLAN, [3.5]), 3.75);
});

test("the worked example: 3 then 3.75 extends the last window by 15 minutes", () => {
  assert.equal(adjustedFromPlan(PLAN, [3, 3.75]), 4.25);
});

test("the day still adds up to the planned total", () => {
  const actual = [2.5];
  const second = adjustedFromPlan(PLAN, actual)!;
  const third = adjustedFromPlan(PLAN, [...actual, second])!;
  assert.equal(actual[0] + second + third, 11);
});

test("a badly overrun day shortens what's left, down to a floor", () => {
  // Awake nine hours before the first nap: six over, split across the two left.
  assert.equal(adjustedFromPlan(PLAN, [9]), 1);
  // Far enough over and the arithmetic would go negative, which is no use to anyone.
  assert.equal(adjustedFromPlan(PLAN, [12]), MIN_ADJUSTED_HOURS);
});

test("an unusually short day stretches what's left, up to a ceiling", () => {
  // Awake only an hour before the first nap: two hours owed, split over the two left.
  assert.equal(adjustedFromPlan(PLAN, [1]), 5);
  // Owed so much that a window would more than double, which nobody would act on.
  assert.equal(adjustedFromPlan(PLAN, [0.5, 0.5]), 8);
});

test("more naps than windows falls back to repeating the last one", () => {
  assert.equal(adjustedFromPlan(PLAN, [3, 4, 4]), 4);
  assert.equal(adjustedFromPlan(PLAN, [3, 4, 4, 1]), 4);
});

test("no windows configured means no window", () => {
  assert.equal(adjustedFromPlan([], [3]), null);
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

test("overshooting a nap shortens the one after it", () => {
  // Slept 1.75h instead of 1.5: the quarter hour comes off the nap still to come.
  assert.equal(adjustedFromPlan(NAP_PLAN, [1.75]), 1);
});

test("waking early from a nap lengthens the one after it", () => {
  // Slept 1h instead of 1.5: the half hour is handed to the nap still to come.
  assert.equal(adjustedFromPlan(NAP_PLAN, [1]), 1.75);
});

test("nap time also holds its daily total", () => {
  const first = 1.75;
  const second = adjustedFromPlan(NAP_PLAN, [first])!;
  assert.equal(first + second, 2.75);
});

test("each finished nap's own length is measured", () => {
  const sessions = [
    nap("2026-09-09T10:00:00Z", "2026-09-09T11:45:00Z"),
    nap("2026-09-09T14:45:00Z", "2026-09-09T15:30:00Z"),
    nap("2026-09-09T18:00:00Z", null),
  ];
  assert.deepEqual(completedNapHours(morning, sessions), [1.75, 0.75]);
});
