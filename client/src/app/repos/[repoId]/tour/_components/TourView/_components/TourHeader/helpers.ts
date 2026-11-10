/** Pure helpers for TourHeader. */

import type { OnboardingIndexReadiness, OnboardingTour } from "@devdigest/shared";

/** The repo moved on since the tour was generated (the index points at another commit). */
export function isStale(tour: OnboardingTour | null, index: OnboardingIndexReadiness): boolean {
  return !!tour && !!index.indexed_sha && index.indexed_sha !== tour.commit_sha;
}

/** The tour was built from an index that was not fully built. */
export function isPartialIndex(tour: OnboardingTour | null): boolean {
  return tour?.index_status === "partial" || tour?.index_status === "degraded";
}
