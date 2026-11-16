import { and, eq } from 'drizzle-orm';
import type { Container } from '../../platform/container.js';
import * as t from '../../db/schema.js';
import type { AlertRule } from './types.js';

export async function loadRules(container: Container, workspaceId: string): Promise<AlertRule[]> {
  const rows = await container.db
    .select()
    .from(t.alertRules)
    .where(and(eq(t.alertRules.workspaceId, workspaceId), eq(t.alertRules.muted, false)));

  return rows.map((row) => ({
    id: row.id,
    workspaceId: row.workspaceId,
    channel: row.channel,
    minSeverity: row.minSeverity,
    target: row.target.trim(),
    muted: row.muted,
  }));
}
