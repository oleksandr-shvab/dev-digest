/** Pure helpers for TourHeader. */

import type { OnboardingIndexReadiness, OnboardingTour } from "@devdigest/shared";

export type AgeUnit = "justNow" | "minutes" | "hours" | "days";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** How long ago `iso` was, as a unit key (for the `tour.age.*` messages) and a count. */
export function relativeAge(iso: string, now: number): { unit: AgeUnit; n: number } {
  const diff = Math.max(0, now - new Date(iso).getTime());
  if (diff < MINUTE) return { unit: "justNow", n: 0 };
  if (diff < HOUR) return { unit: "minutes", n: Math.floor(diff / MINUTE) };
  if (diff < DAY) return { unit: "hours", n: Math.floor(diff / HOUR) };
  return { unit: "days", n: Math.floor(diff / DAY) };
}

/** The repo moved on since the tour was generated (the index points at another commit). */
export function isStale(tour: OnboardingTour | null, index: OnboardingIndexReadiness): boolean {
  return !!tour && !!index.indexed_sha && index.indexed_sha !== tour.commit_sha;
}

/** The tour was built from an index that was not fully built. */
export function isPartialIndex(tour: OnboardingTour | null): boolean {
  return tour?.index_status === "partial" || tour?.index_status === "degraded";
}
