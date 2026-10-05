import { and, eq } from 'drizzle-orm';
import type { Db, Tx } from '../../../db/client.js';
import * as t from '../../../db/schema.js';
import type { Intent, IntentConfidence, IntentSource } from '@devdigest/shared';
import type { PullRow } from '../../../db/rows.js';

// ---- PR lookup (workspace-scoped) -----------------------------------------

export async function getPull(
  db: Db,
  workspaceId: string,
  prId: string,
): Promise<PullRow | undefined> {
  const [row] = await db
    .select()
    .from(t.pullRequests)
    .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
  return row;
}

export async function getRepo(
  db: Db,
  repoId: string,
): Promise<typeof t.repos.$inferSelect | undefined> {
  const [row] = await db.select().from(t.repos).where(eq(t.repos.id, repoId));
  return row;
}

export async function getPrFiles(
  db: Db,
  prId: string,
): Promise<(typeof t.prFiles.$inferSelect)[]> {
  return db.select().from(t.prFiles).where(eq(t.prFiles.prId, prId));
}

/**
 * Record the commit a review just ran against, so the PR list can derive
 * `reviewed` vs `needs_review` (head moved since the last review) vs `stale`.
 */
export async function markReviewed(db: Db | Tx, prId: string, sha: string): Promise<void> {
  await db
    .update(t.pullRequests)
    .set({ lastReviewedSha: sha })
    .where(eq(t.pullRequests.id, prId));
}

// ---- intent ---------------------------------------------------------------

export type PrIntentRow = typeof t.prIntent.$inferSelect;

/** Everything one derivation stores about a PR's intent (one row per PR). */
export type PrIntentValues = Intent & {
  confidence: IntentConfidence;
  sources: IntentSource[];
  provider: string;
  model: string;
  headSha: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number | null;
};

export async function upsertIntent(
  db: Db,
  prId: string,
  values: PrIntentValues,
): Promise<PrIntentRow> {
  const columns = {
    intent: values.intent,
    inScope: values.in_scope,
    outOfScope: values.out_of_scope,
    confidence: values.confidence,
    sources: values.sources,
    provider: values.provider,
    model: values.model,
    headSha: values.headSha,
    tokensIn: values.tokensIn,
    tokensOut: values.tokensOut,
    costUsd: values.costUsd,
    derivedAt: new Date(),
  };
  const [row] = await db
    .insert(t.prIntent)
    .values({ prId, ...columns })
    .onConflictDoUpdate({ target: t.prIntent.prId, set: columns })
    .returning();
  return row!;
}

export async function getIntent(db: Db, prId: string): Promise<PrIntentRow | undefined> {
  const [row] = await db.select().from(t.prIntent).where(eq(t.prIntent.prId, prId));
  return row;
}
