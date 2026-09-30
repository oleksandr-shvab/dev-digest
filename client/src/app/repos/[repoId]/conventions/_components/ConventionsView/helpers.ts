import type { ConventionCandidate } from "@devdigest/shared";

export type ConventionFilter = "all" | "pending" | "accepted";

export function filterCandidates(
  candidates: ConventionCandidate[],
  filter: ConventionFilter,
): ConventionCandidate[] {
  if (filter === "all") return candidates;
  return candidates.filter((c) => c.status === filter);
}
