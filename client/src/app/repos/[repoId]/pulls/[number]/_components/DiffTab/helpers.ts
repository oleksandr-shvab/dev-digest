/** Pure helpers for the Files changed tab (Smart Diff grouping + review findings). */
import type {
  FindingRecord,
  PrFile,
  ReviewRecord,
  SmartDiff,
  SmartDiffRole,
} from "@devdigest/shared";

/**
 * The reviews whose findings the diff shows: the newest `kind: "review"` review
 * of each agent (a null agent counts as one agent). Input must be newest-first,
 * as `GET /pulls/:id/reviews` returns it. Per agent because "Run all" produces
 * one review per agent, while re-running an agent supersedes its older pass.
 *
 * Twin of `pickLatestReviewPerAgent` in
 * `server/src/modules/reviews/smart-diff/build.ts` — keep both in sync.
 */
export function pickLatestReviewPerAgent(reviewsNewestFirst: ReviewRecord[]): ReviewRecord[] {
  const seenAgents = new Set<string | null>();
  const latest: ReviewRecord[] = [];
  for (const r of reviewsNewestFirst) {
    if (r.kind !== "review") continue;
    if (seenAgents.has(r.agent_id)) continue;
    seenAgents.add(r.agent_id);
    latest.push(r);
  }
  return latest;
}

/**
 * Smart Diff groups in the server's order, each holding the `PrFile`s of its
 * paths in GitHub order (the order of `files`). A file the server did not place
 * is appended to `core`, so nothing disappears.
 */
export function groupFilesByRole(
  smartDiff: SmartDiff,
  files: PrFile[],
): { role: SmartDiffRole; files: PrFile[] }[] {
  const placed = new Set(smartDiff.groups.flatMap((g) => g.files.map((f) => f.path)));
  return smartDiff.groups.map((g) => {
    const paths = new Set(g.files.map((f) => f.path));
    return {
      role: g.role,
      files: files.filter((f) => paths.has(f.path) || (g.role === "core" && !placed.has(f.path))),
    };
  });
}

/** Number of files with at least one open (not dismissed) finding — files, not findings. */
export function countFilesWithFindings(files: PrFile[], findings: FindingRecord[]): number {
  return files.filter((f) => findings.some((x) => x.file === f.path && x.dismissed_at == null))
    .length;
}
