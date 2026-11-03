/** Pure helpers for TourView. */

import type { OnboardingTourState } from "@devdigest/shared";

export type TourViewKind = "loading" | "error" | "empty" | "ready";

/** Which screen to show for the query result: a stored tour wins over everything else. */
export function viewOf(q: { data: OnboardingTourState | undefined; isLoading: boolean; isError: boolean }): TourViewKind {
  if (q.data?.tour) return "ready";
  if (q.isLoading) return "loading";
  if (q.isError || !q.data) return "error";
  return "empty";
}

/** Generate / Regenerate is allowed only on a ready index and while nothing is running. */
export function canGenerate(state: OnboardingTourState): boolean {
  return state.index.ready && !state.generating;
}

/** Scroll a section into view and move focus to its heading (keyboard and screen-reader users). */
export function goToSection(id: string): void {
  document.getElementById(id)?.scrollIntoView({ block: "start" });
  document.getElementById(`${id}-heading`)?.focus({ preventScroll: true });
}
