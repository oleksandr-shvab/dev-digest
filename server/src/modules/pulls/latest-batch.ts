import type { FindingCounts } from '@devdigest/shared';
import { rollupSeverities } from './status.js';

/**
 * Pure helpers behind the PR list's "latest review" columns (COST,
 * FINDINGS). Both need the exact same batch of runs, so the batch-pinning
 * rule lives here once — see server/specs/run-cost-attribution.md and
 * server/specs/pr-list-finding-counts.md.
 */

export interface BatchRunRow {
  prId: string | null;
  multiAgentRunId: string | null;
  id: string;
}

/**
 * Groups agent-run rows (must already be sorted newest-first by `ranAt`)
 * into each PR's "latest batch": the newest run's batch key
 * (`multiAgentRunId ?? run.id`) pins that PR's batch, and only rows sharing
 * that key are kept. A PR absent from `runRowsNewestFirst` has no runs at
 * all and is absent from the result.
 */
export function pickLatestBatchByPr<T extends BatchRunRow>(
  runRowsNewestFirst: T[],
): Map<string, T[]> {
  const batchKeyByPr = new Map<string, string>();
  const batchByPr = new Map<string, T[]>();
  for (const run of runRowsNewestFirst) {
    if (!run.prId) continue;
    const batchKey = run.multiAgentRunId ?? run.id;
    const pinnedKey = batchKeyByPr.get(run.prId);
    if (pinnedKey === undefined) {
      batchKeyByPr.set(run.prId, batchKey);
      batchByPr.set(run.prId, [run]);
    } else if (batchKey === pinnedKey) {
      batchByPr.get(run.prId)!.push(run);
    }
    // else: an older, non-pinned batch — ignored.
  }
  return batchByPr;
}

export interface ReviewRow {
  prId: string;
}

export interface FindingSeverityRow {
  prId: string;
  severity: string;
}

/**
 * Aggregates per-severity finding counts for every PR that has at least one
 * `kind: 'review'` row in its pinned batch, reusing `rollupSeverities` (the
 * existing per-review severity tally) per PR group. A PR present in
 * `reviewRows` but absent from `findingRows` (no non-dismissed findings
 * survived triage) reads `{CRITICAL: 0, WARNING: 0, SUGGESTION: 0}`, not
 * "missing" — the caller distinguishes "no review yet" (absent from the
 * returned map) from "reviewed, nothing outstanding" (present, all zero).
 */
export function aggregateFindingCounts(
  reviewRows: ReviewRow[],
  findingRows: FindingSeverityRow[],
): Map<string, FindingCounts> {
  const rowsByPr = new Map<string, { severity: string }[]>();
  for (const { prId } of reviewRows) {
    if (!rowsByPr.has(prId)) rowsByPr.set(prId, []);
  }
  for (const row of findingRows) {
    // defensive — findingRows is expected to be a subset of reviewRows' PRs
    rowsByPr.get(row.prId)?.push(row);
  }
  const countsByPr = new Map<string, FindingCounts>();
  for (const [prId, rows] of rowsByPr) {
    const c = rollupSeverities(rows);
    countsByPr.set(prId, { CRITICAL: c.critical, WARNING: c.warning, SUGGESTION: c.suggestion });
  }
  return countsByPr;
}
