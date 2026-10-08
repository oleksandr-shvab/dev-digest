import type { SmartDiff } from '@devdigest/shared';
import type { ReviewRow } from '../repository.js';
import { classifyFile } from './classify.js';
import { SMART_DIFF_ROLE_ORDER } from './constants.js';

/** Structurally satisfied by a `pr_files` row. */
export interface SmartDiffSourceFile {
  path: string;
  additions: number;
  deletions: number;
}

/** Structurally satisfied by a `findings` row. */
export interface SmartDiffSourceFinding {
  file: string;
  startLine: number;
  dismissedAt: Date | null;
}

/**
 * The reviews whose findings the Smart Diff shows: the newest `kind: 'review'`
 * review of each agent (a `null` agent counts as one agent).
 *
 * Precondition: `rowsNewestFirst` is newest-first, as
 * `ReviewRepository.reviewsForPull` returns it.
 *
 * Per agent because "Run all" produces one review per agent, while re-running
 * an agent supersedes its older pass.
 *
 * Twin on the client: `DiffTab/helpers.ts` — keep both in sync.
 */
export function pickLatestReviewPerAgent<T extends { review: Pick<ReviewRow, 'kind' | 'agentId'> }>(
  rowsNewestFirst: T[],
): T[] {
  const seenAgents = new Set<string | null>();
  const latest: T[] = [];
  for (const row of rowsNewestFirst) {
    if (row.review.kind !== 'review') continue;
    if (seenAgents.has(row.review.agentId)) continue;
    seenAgents.add(row.review.agentId);
    latest.push(row);
  }
  return latest;
}

/** Group PR files by role and attach the lines that carry an open finding. */
export function buildSmartDiff(
  files: SmartDiffSourceFile[],
  findings: SmartDiffSourceFinding[],
): SmartDiff {
  const groups = SMART_DIFF_ROLE_ORDER.map((role) => ({
    role,
    files: files
      .filter((f) => classifyFile(f.path) === role)
      .map((f) => ({
        path: f.path,
        additions: f.additions,
        deletions: f.deletions,
        finding_lines: [
          ...new Set(
            findings
              .filter((x) => x.file === f.path && x.dismissedAt === null)
              .map((x) => x.startLine),
          ),
        ].sort((a, b) => a - b),
      })),
  }));

  return {
    groups,
    split_suggestion: {
      too_big: false,
      total_lines: files.reduce((sum, f) => sum + f.additions + f.deletions, 0),
      proposed_splits: [],
    },
  };
}
