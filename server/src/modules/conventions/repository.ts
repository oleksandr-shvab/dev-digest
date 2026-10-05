import { and, desc, eq, inArray, ne } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { ConventionPatchPlan } from './helpers.js';

/**
 * Conventions data-access. The ONLY layer touching the `conventions` table.
 * Every read/write is scoped by `workspaceId`; callers that already have a
 * workspace-checked `repoId` (via `RepoRepository.getById`) pass it straight
 * through.
 */
export type ConventionRow = typeof t.conventions.$inferSelect;

export interface InsertConvention {
  workspaceId: string;
  repoId: string;
  category: ConventionRow['category'];
  rule: string;
  evidencePath: string;
  evidenceLine: number;
  evidenceSnippet: string;
  confidence: number;
}

export class ConventionsRepository {
  constructor(private db: Db) {}

  /** Pending + accepted, confidence desc (spec: GET /repos/:id/conventions). */
  async listPendingAndAccepted(workspaceId: string, repoId: string): Promise<ConventionRow[]> {
    return this.db
      .select()
      .from(t.conventions)
      .where(
        and(
          eq(t.conventions.workspaceId, workspaceId),
          eq(t.conventions.repoId, repoId),
          ne(t.conventions.status, 'rejected'),
        ),
      )
      .orderBy(desc(t.conventions.confidence));
  }

  /** Already-decided rows (accepted or rejected) — what a rescan dedupes against. */
  async listKept(repoId: string): Promise<Pick<ConventionRow, 'rule' | 'status'>[]> {
    return this.db
      .select({ rule: t.conventions.rule, status: t.conventions.status })
      .from(t.conventions)
      .where(and(eq(t.conventions.repoId, repoId), ne(t.conventions.status, 'pending')));
  }

  /**
   * Rescan (Decision 8), in one transaction: drop this repo's undecided
   * candidates, then insert the survivors of the new scan as `pending`.
   * `accepted`/`rejected` rows are untouched.
   */
  async replacePending(repoId: string, values: InsertConvention[]): Promise<ConventionRow[]> {
    return this.db.transaction(async (tx) => {
      await tx
        .delete(t.conventions)
        .where(and(eq(t.conventions.repoId, repoId), eq(t.conventions.status, 'pending')));
      if (values.length === 0) return [];
      return tx
        .insert(t.conventions)
        .values(values.map((v) => ({ ...v, status: 'pending' as const })))
        .returning();
    });
  }

  async getById(workspaceId: string, id: string): Promise<ConventionRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)));
    return row;
  }

  /** Scoped to one repo — candidate ids a skill draft/create is built from. */
  async getByIds(workspaceId: string, repoId: string, ids: string[]): Promise<ConventionRow[]> {
    if (ids.length === 0) return [];
    return this.db
      .select()
      .from(t.conventions)
      .where(
        and(
          eq(t.conventions.workspaceId, workspaceId),
          eq(t.conventions.repoId, repoId),
          inArray(t.conventions.id, ids),
        ),
      );
  }

  async update(workspaceId: string, id: string, plan: ConventionPatchPlan['set']): Promise<ConventionRow | undefined> {
    const [row] = await this.db
      .update(t.conventions)
      .set({ ...plan, updatedAt: new Date() })
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)))
      .returning();
    return row;
  }
}
