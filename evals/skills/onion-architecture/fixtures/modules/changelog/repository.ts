import { desc, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

export type ChangelogRow = typeof t.changelogEntries.$inferSelect;

export class ChangelogRepository {
  constructor(private db: Db) {}

  listEntries(workspaceId: string): Promise<ChangelogRow[]> {
    return this.db
      .select()
      .from(t.changelogEntries)
      .where(eq(t.changelogEntries.workspaceId, workspaceId))
      .orderBy(desc(t.changelogEntries.createdAt))
      .limit(100);
  }

  async insertEntry(workspaceId: string, prId: string, payload: unknown): Promise<ChangelogRow> {
    const [row] = await this.db
      .insert(t.changelogEntries)
      .values({ workspaceId, prId, payload })
      .onConflictDoUpdate({
        target: [t.changelogEntries.workspaceId, t.changelogEntries.prId],
        set: { payload },
      })
      .returning();
    return row!;
  }
}
