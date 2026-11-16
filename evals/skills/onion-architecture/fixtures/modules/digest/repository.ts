import { and, desc, eq, gte, lt, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

export type DigestRow = typeof t.digests.$inferSelect;

export class DigestRepository {
  constructor(private db: Db) {}

  async reviewedPullIds(workspaceId: string, from: Date, to: Date): Promise<string[]> {
    const rows = await this.db
      .selectDistinct({ prId: t.reviews.prId })
      .from(t.reviews)
      .where(
        and(
          eq(t.reviews.workspaceId, workspaceId),
          gte(t.reviews.createdAt, from),
          lt(t.reviews.createdAt, to),
        ),
      );
    return rows.map((r) => r.prId);
  }

  topFindingFiles(
    workspaceId: string,
    from: Date,
    to: Date,
    limit: number,
  ): Promise<{ path: string; findings: number }[]> {
    return this.db
      .select({ path: t.findings.file, findings: sql<number>`count(*)::int` })
      .from(t.findings)
      .innerJoin(t.reviews, eq(t.findings.reviewId, t.reviews.id))
      .where(
        and(
          eq(t.reviews.workspaceId, workspaceId),
          gte(t.reviews.createdAt, from),
          lt(t.reviews.createdAt, to),
        ),
      )
      .groupBy(t.findings.file)
      .orderBy(desc(sql`count(*)`))
      .limit(limit);
  }

  async insertSnapshot(workspaceId: string, weekStart: Date, payload: unknown): Promise<DigestRow> {
    const [row] = await this.db
      .insert(t.digests)
      .values({ workspaceId, weekStart, payload })
      .onConflictDoUpdate({
        target: [t.digests.workspaceId, t.digests.weekStart],
        set: { payload },
      })
      .returning();
    return row!;
  }
}
