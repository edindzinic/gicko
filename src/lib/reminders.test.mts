/**
 * Which reminder the banner shows, and for how long. Run with `npm test`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { currentReminder, reminderKey } from "./reminders.ts";
import type { Due } from "./schedule.ts";

const at = (iso: string) => new Date(iso);
const now = at("2026-09-14T14:40:00Z");

/** A nap due at 14:45, announced from 14:35 — ten minutes of notice. */
const napDue: Due = {
  kind: "nap_due",
  dedupeKey: "session-1",
  targetAt: at("2026-09-14T14:35:00Z"),
  ttlSeconds: 10 * 60,
};

const feedingDue: Due = {
  kind: "feeding_due",
  dedupeKey: "feeding-1",
  targetAt: at("2026-09-14T14:20:00Z"),
  ttlSeconds: 30 * 60,
};

test("a reminder inside its window is the one to show", () => {
  assert.equal(currentReminder([napDue], now)?.kind, "nap_due");
});

test("nothing before the moment it names", () => {
  assert.equal(currentReminder([napDue], at("2026-09-14T14:34:59Z")), null);
});

test("it is shown for the whole window, and not a second past it", () => {
  assert.equal(currentReminder([napDue], at("2026-09-14T14:35:00Z"))?.kind, "nap_due");
  assert.equal(currentReminder([napDue], at("2026-09-14T14:44:59Z"))?.kind, "nap_due");
  // 14:45 is the nap itself: the notice has done its job.
  assert.equal(currentReminder([napDue], at("2026-09-14T14:45:00Z")), null);
});

test("two at once shows the one that came due first", () => {
  assert.equal(currentReminder([napDue, feedingDue], now)?.kind, "feeding_due");
});

test("a dismissed reminder stays dismissed, and lets the other one through", () => {
  assert.equal(currentReminder([napDue, feedingDue], now, [reminderKey(feedingDue)])?.kind, "nap_due");
  assert.equal(
    currentReminder([napDue, feedingDue], now, [reminderKey(feedingDue), reminderKey(napDue)]),
    null,
  );
});

test("dismissing one nap doesn't dismiss the next one", () => {
  const later: Due = { ...napDue, dedupeKey: "session-2" };
  assert.equal(currentReminder([later], now, [reminderKey(napDue)])?.dedupeKey, "session-2");
});

test("nothing due is nothing shown", () => {
  assert.equal(currentReminder([], now), null);
});
