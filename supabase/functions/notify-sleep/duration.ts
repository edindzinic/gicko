/**
 * How long something lasted, in words: "2h 30m", "2h", "45m".
 *
 * A copy of src/lib/duration.ts, which is the original. This function words the feeding
 * interval in the reminder below, and the banner in the app words it with the same
 * function — two different roundings of one number on one phone is worse than either.
 * Edit the original, copy it here, redeploy.
 */
export function formatDuration(minutes: number) {
  const total = Math.round(minutes);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h <= 0) return `${m}m`;
  if (m <= 0) return `${h}h`;
  return `${h}h ${m}m`;
}
