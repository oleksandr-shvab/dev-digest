import { and, eq, gte } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { AlertRule } from './types.js';

function toRule(row: typeof t.alertRules.$inferSelect): AlertRule {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    channel: row.channel,
    minSeverity: row.minSeverity,
    target: row.target,
    muted: row.muted,
  };
}

export class AlertRepository {
  constructor(private db: Db) {}

  async listRules(workspaceId: string): Promise<AlertRule[]> {
    const rows = await this.db
      .select()
      .from(t.alertRules)
      .where(eq(t.alertRules.workspaceId, workspaceId));
    return rows.map(toRule);
  }

  async recentDedupeKeys(workspaceId: string, since: Date): Promise<Map<string, number>> {
    const rows = await this.db
      .select({ key: t.alertLog.dedupeKey, at: t.alertLog.sentAt })
      .from(t.alertLog)
      .where(and(eq(t.alertLog.workspaceId, workspaceId), gte(t.alertLog.sentAt, since)));
    return new Map(rows.map((r) => [r.key, r.at.getTime()] as const));
  }

  async recordSent(workspaceId: string, keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    await this.db
      .insert(t.alertLog)
      .values(keys.map((dedupeKey) => ({ workspaceId, dedupeKey })));
  }
}
