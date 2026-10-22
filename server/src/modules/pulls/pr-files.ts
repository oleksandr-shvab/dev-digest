import { eq } from 'drizzle-orm';
import type { PrDetail } from '@devdigest/shared';
import type { Db, Tx } from '../../db/client.js';
import * as t from '../../db/schema.js';

/**
 * Replace the stored changed-file rows of one PR with `files` (delete +
 * insert). Shared by `GET /pulls/:id` and the `GET /repos/:id/pulls` list sync
 * so both write `pr_files` the same way. Not transactional on its own: pass a
 * `tx` and wrap it together with whatever else must succeed or fail with it —
 * a failure between the delete and the insert would otherwise leave the PR
 * with no files.
 */
export async function replacePrFiles(
  db: Db | Tx,
  prId: string,
  files: PrDetail['files'],
): Promise<void> {
  await db.delete(t.prFiles).where(eq(t.prFiles.prId, prId));
  if (files.length > 0) {
    await db.insert(t.prFiles).values(
      files.map((f) => ({
        prId,
        path: f.path,
        additions: f.additions,
        deletions: f.deletions,
        patch: f.patch ?? null,
      })),
    );
  }
}

interface DetailFetchRow {
  id: string;
  number: number;
  additions: number;
  deletions: number;
  filesCount: number;
}

/**
 * Which listed PRs need a detail fetch (`getPullRequest`, which carries the
 * files) during the list sync — one fetch per PR, capped at `limit`:
 *   (a) diff stats are all zero (GitHub's list payload has none),
 *   (b) the PR says it has files but `pr_files` has no rows for it,
 *   (c) its head sha moved during this sync, so the stored files are stale.
 * A PR that is complete and unchanged is never returned.
 */
export function selectDetailFetchCandidates<R extends DetailFetchRow>(
  rows: readonly R[],
  state: { prIdsWithFiles: ReadonlySet<string>; headChangedNumbers: ReadonlySet<number> },
  limit: number,
): R[] {
  return rows
    .filter(
      (r) =>
        (r.additions === 0 && r.deletions === 0 && r.filesCount === 0) ||
        (r.filesCount > 0 && !state.prIdsWithFiles.has(r.id)) ||
        state.headChangedNumbers.has(r.number),
    )
    .slice(0, limit);
}
