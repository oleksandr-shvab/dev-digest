/** Pure helpers for PrBriefCard. */
import type { PrBriefState, ReviewRecord } from "@devdigest/shared";

export type BriefView = "loading" | "error" | "noFiles" | "empty" | "ready";

/** Which body the card shows. A stored brief always wins over "no files" / "empty". */
export function viewOf({
  state,
  isLoading,
  isError,
  hasFiles,
}: {
  state: PrBriefState | undefined;
  isLoading: boolean;
  isError: boolean;
  hasFiles: boolean;
}): BriefView {
  if (isLoading) return "loading";
  if (isError && !state) return "error";
  if (state?.brief) return "ready";
  if (!hasFiles) return "noFiles";
  return "empty";
}

/** The newest review that carries a verdict (a summary-only review has none). */
export function newestVerdictReview(reviews: ReviewRecord[]): ReviewRecord | null {
  let newest: ReviewRecord | null = null;
  for (const r of reviews) {
    if (r.kind !== "review" || !r.verdict) continue;
    if (!newest || Date.parse(r.created_at) > Date.parse(newest.created_at)) newest = r;
  }
  return newest;
}

/** Counts shown on the verdict banner: all findings, and the undismissed CRITICAL ones. */
export function bannerCounts(review: ReviewRecord): { findings: number; blockers: number } {
  return {
    findings: review.findings.length,
    blockers: review.findings.filter((f) => f.severity === "CRITICAL" && !f.dismissed_at).length,
  };
}

export function shortSha(sha: string): string {
  return sha.slice(0, 7);
}

/** A cited file can be opened in Files changed only when this PR's diff holds it. */
export function isInDiff(diffPaths: string[], file: string): boolean {
  return diffPaths.includes(file);
}

/** The text for the polite live region (`prBrief.<key>`), or null when nothing changed state. */
export function liveMessage(
  state: PrBriefState | undefined,
): { key: "generating" | "failed" | "generated"; values: Record<string, string> } | null {
  if (!state) return null;
  if (state.generating) return { key: "generating", values: {} };
  if (state.last_error) return { key: "failed", values: { reason: state.last_error } };
  if (state.brief) return { key: "generated", values: {} };
  return null;
}
