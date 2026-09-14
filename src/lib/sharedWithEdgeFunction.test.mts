/**
 * Two files in here are deployed a second time, inside the notify-sleep edge function, so
 * that the reminders and the app work from one set of rules. Nothing enforced that: the
 * README asked whoever edited one to copy it over, and an edit that didn't get copied
 * would show up as the lock screen and the app disagreeing about when the next nap is —
 * at night, to nobody watching.
 *
 * So the copies are checked here instead. Only the leading block comment may differ,
 * which is where each file says which of the two it is.
 *
 * Run with `npm test`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const SHARED = ["dayBudget.ts", "schedule.ts"];
const EDGE_FUNCTION_DIR = "supabase/functions/notify-sleep";

/** Everything after the header comment, which is the part that has to match. */
function body(path: string) {
  const source = readFileSync(path, "utf8");
  const end = source.indexOf("*/");
  assert.notEqual(end, -1, `${path} should open with a block comment saying which copy it is`);
  return source.slice(end + 2).trim();
}

for (const file of SHARED) {
  test(`${file} is identical to the copy deployed with notify-sleep`, () => {
    assert.equal(
      body(`${EDGE_FUNCTION_DIR}/${file}`),
      body(`src/lib/${file}`),
      `src/lib/${file} and ${EDGE_FUNCTION_DIR}/${file} have drifted apart. Copy the original ` +
        `over and redeploy the function, or the app and the reminders will disagree.`,
    );
  });
}
