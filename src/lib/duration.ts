/**
 * How long something lasted, in words: "2h 30m", "2h", "45m".
 *
 * No imports on purpose. A byte-identical copy is deployed with the notify-sleep edge
 * function, which now names the feeding interval in its reminder and has to word it
 * exactly the way the banner in the app does — two different roundings of the same number
 * on the same phone is worse than either. Edit here, copy it over, redeploy;
 * sharedWithEdgeFunction.test.mts fails if the two drift.
 *
 * It sits apart from time.ts, which it used to live in, only because that file leans on
 * date-fns and the function has no use for it. time.ts re-exports it.
 */
export function formatDuration(minutes: number) {
  const total = Math.round(minutes);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h <= 0) return `${m}m`;
  if (m <= 0) return `${h}h`;
  return `${h}h ${m}m`;
}
