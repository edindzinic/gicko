/**
 * Which reminder the app should be showing, out of everything computeDue found.
 *
 * The push side asks a narrower question — "has this moment just arrived?" — because a
 * notification is sent once and then it's the operating system's problem. A banner is
 * different: it's only seen if it happens to be on screen, so it stays up for as long as
 * the reminder is worth acting on, which is exactly the window the push gives itself to
 * be delivered in. A nap due at 14:45 is announced from 14:35 and gone by 14:45.
 */
import type { Due } from "./schedule.ts";

/**
 * The one to show, or null. Dismissals are keyed `kind:dedupeKey`, the same pair the push
 * side dedupes on, so waving away the 14:45 nap doesn't also wave away the 17:00 one.
 *
 * Returns a single reminder rather than a list: a feeding and a nap can come due together,
 * and two banners stacked over the top of the day is worse than the nearer one on its own.
 */
export function currentReminder(due: Due[], now: Date, dismissed: string[] = []): Due | null {
  const at = now.getTime();
  return (
    due
      .filter((item) => {
        const from = item.targetAt.getTime();
        return (
          at >= from &&
          at < from + item.ttlSeconds * 1000 &&
          !dismissed.includes(reminderKey(item))
        );
      })
      // Whichever came due first: it has the least of its window left.
      .sort((a, b) => a.targetAt.getTime() - b.targetAt.getTime())[0] ?? null
  );
}

export function reminderKey(due: Due) {
  return `${due.kind}:${due.dedupeKey}`;
}
