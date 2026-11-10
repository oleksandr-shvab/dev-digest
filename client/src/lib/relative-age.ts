/* relative-age.ts — "how long ago" as a unit key plus a count, shared by the
   onboarding tour header and the PR brief meta line. The caller maps the unit
   to its own `age.*` messages. */

export type AgeUnit = "justNow" | "minutes" | "hours" | "days";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** How long ago `iso` was, as a unit key (for `age.*` messages) and a count. */
export function relativeAge(iso: string, now: number): { unit: AgeUnit; n: number } {
  const diff = Math.max(0, now - new Date(iso).getTime());
  if (diff < MINUTE) return { unit: "justNow", n: 0 };
  if (diff < HOUR) return { unit: "minutes", n: Math.floor(diff / MINUTE) };
  if (diff < DAY) return { unit: "hours", n: Math.floor(diff / HOUR) };
  return { unit: "days", n: Math.floor(diff / DAY) };
}
