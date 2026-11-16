import { and, eq, gte, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

export interface UsageSummary {
  spentUsd: number;
  capUsd: number | null;
  byModel: { model: string; costUsd: number }[];
}

function monthStart(): Date {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export class UsageRepository {
  constructor(private db: Db) {}

  async monthlySpend(workspaceId: string): Promise<number> {
    const [row] = await this.db
      .select({ spent: sql<number>`coalesce(sum(${t.llmUsage.costUsd}), 0)` })
      .from(t.llmUsage)
      .where(and(eq(t.llmUsage.workspaceId, workspaceId), gte(t.llmUsage.createdAt, monthStart())));
    return Number(row?.spent ?? 0);
  }

  async getCap(workspaceId: string): Promise<number | null> {
    const [row] = await this.db
      .select({ capUsd: t.usageCaps.capUsd })
      .from(t.usageCaps)
      .where(eq(t.usageCaps.workspaceId, workspaceId));
    return row ? Number(row.capUsd) : null;
  }

  async setCap(workspaceId: string, capUsd: number): Promise<void> {
    await this.db
      .insert(t.usageCaps)
      .values({ workspaceId, capUsd })
      .onConflictDoUpdate({ target: t.usageCaps.workspaceId, set: { capUsd } });
  }

  async summary(workspaceId: string): Promise<UsageSummary> {
    const byModel = await this.db
      .select({ model: t.llmUsage.model, costUsd: sql<number>`sum(${t.llmUsage.costUsd})` })
      .from(t.llmUsage)
      .where(and(eq(t.llmUsage.workspaceId, workspaceId), gte(t.llmUsage.createdAt, monthStart())))
      .groupBy(t.llmUsage.model);
    const spentUsd = byModel.reduce((s, r) => s + Number(r.costUsd), 0);
    return { spentUsd, capUsd: await this.getCap(workspaceId), byModel };
  }
}
