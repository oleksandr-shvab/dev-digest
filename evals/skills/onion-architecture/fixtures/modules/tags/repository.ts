import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

export type TagRow = typeof t.tags.$inferSelect;
export type NewTag = typeof t.tags.$inferInsert;

export class TagRepository {
  constructor(private db: Db) {}

  listTags(workspaceId: string): Promise<TagRow[]> {
    return this.db.select().from(t.tags).where(eq(t.tags.workspaceId, workspaceId));
  }

  async findByName(workspaceId: string, name: string): Promise<TagRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.tags)
      .where(and(eq(t.tags.workspaceId, workspaceId), eq(t.tags.name, name)));
    return row;
  }

  async insertTag(values: NewTag): Promise<TagRow> {
    const [row] = await this.db.insert(t.tags).values(values).returning();
    return row!;
  }

  async attachTags(prId: string, tagIds: string[]): Promise<void> {
    if (tagIds.length === 0) return;
    await this.db
      .insert(t.pullTags)
      .values(tagIds.map((tagId) => ({ prId, tagId })))
      .onConflictDoNothing();
  }
}
