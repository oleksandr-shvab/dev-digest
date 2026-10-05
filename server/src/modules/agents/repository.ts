import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Db, Tx } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { CiFailOn, Provider, ReviewStrategy } from '@devdigest/shared';
import { DEFAULT_AGENT_DESCRIPTION, INITIAL_AGENT_VERSION } from './constants.js';
import { isConfigChange, sameSkillLinks, type SkillLinkItem } from './helpers.js';

/**
 * A2 — agents data-access. Owns `agents`, `agent_versions`, and the
 * `agent_skills` link table (shared with A1's skills repository, but A2 owns the
 * agent side: link/reorder/list for an agent). Workspace-scoped throughout.
 */

import type { AgentRow, AgentVersionRow } from '../../db/rows.js';
export type { AgentRow, AgentVersionRow };

export interface InsertAgent {
  workspaceId: string;
  name: string;
  description?: string;
  provider: Provider;
  model: string;
  systemPrompt: string;
  outputSchema?: unknown;
  strategy?: ReviewStrategy;
  ciFailOn?: CiFailOn;
  repoIntel?: boolean;
  enabled?: boolean;
  createdBy?: string | null;
}

export interface UpdateAgent {
  name?: string;
  description?: string;
  provider?: Provider;
  model?: string;
  systemPrompt?: string;
  outputSchema?: unknown;
  strategy?: ReviewStrategy;
  ciFailOn?: CiFailOn;
  repoIntel?: boolean;
  enabled?: boolean;
}

/** A skill linked to an agent (with its order), joined from agent_skills. */
export interface LinkedSkillRow {
  skill: typeof t.skills.$inferSelect;
  order: number;
  /** Per-agent on/off (agent_skills.enabled). */
  enabled: boolean;
}

export class AgentsRepository {
  constructor(private db: Db) {}

  async list(workspaceId: string): Promise<AgentRow[]> {
    return this.db.select().from(t.agents).where(eq(t.agents.workspaceId, workspaceId));
  }

  async listEnabled(workspaceId: string): Promise<AgentRow[]> {
    return this.db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.enabled, true)));
  }

  async getById(workspaceId: string, id: string): Promise<AgentRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.id, id)));
    return row;
  }

  /** Delete an agent (scoped to workspace). Versions/skill-links cascade;
   *  agent_runs keep their history with agent_id set null. Returns false if
   *  no such agent existed in the workspace. */
  async deleteById(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.id, id)))
      .returning({ id: t.agents.id });
    return rows.length > 0;
  }

  /** Insert an agent AND record version 1 in agent_versions (immutable snapshot). */
  async insert(values: InsertAgent): Promise<AgentRow> {
    const [row] = await this.db
      .insert(t.agents)
      .values({
        workspaceId: values.workspaceId,
        name: values.name,
        description: values.description ?? DEFAULT_AGENT_DESCRIPTION,
        provider: values.provider,
        model: values.model,
        systemPrompt: values.systemPrompt,
        outputSchema: (values.outputSchema as object | undefined) ?? null,
        ...(values.strategy !== undefined ? { strategy: values.strategy } : {}),
        ...(values.ciFailOn !== undefined ? { ciFailOn: values.ciFailOn } : {}),
        ...(values.repoIntel !== undefined ? { repoIntel: values.repoIntel } : {}),
        enabled: values.enabled ?? true,
        version: INITIAL_AGENT_VERSION,
        createdBy: values.createdBy ?? null,
      })
      .returning();
    await this.snapshotVersion(this.db, row!, INITIAL_AGENT_VERSION);
    return row!;
  }

  /**
   * Update an agent. Any config change bumps the version and snapshots the new
   * config into agent_versions (reproducibility for eval).
   */
  async update(
    workspaceId: string,
    id: string,
    patch: UpdateAgent,
  ): Promise<AgentRow | undefined> {
    const existing = await this.getById(workspaceId, id);
    if (!existing) return undefined;

    // A config-affecting change (anything except just toggling enabled) bumps version.
    const configChanged = isConfigChange(existing, patch);
    const nextVersion = configChanged ? existing.version + 1 : existing.version;

    const [row] = await this.db
      .update(t.agents)
      .set({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.provider !== undefined ? { provider: patch.provider } : {}),
        ...(patch.model !== undefined ? { model: patch.model } : {}),
        ...(patch.systemPrompt !== undefined ? { systemPrompt: patch.systemPrompt } : {}),
        ...(patch.outputSchema !== undefined
          ? { outputSchema: patch.outputSchema as object }
          : {}),
        ...(patch.strategy !== undefined ? { strategy: patch.strategy } : {}),
        ...(patch.ciFailOn !== undefined ? { ciFailOn: patch.ciFailOn } : {}),
        ...(patch.repoIntel !== undefined ? { repoIntel: patch.repoIntel } : {}),
        ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
        ...(configChanged ? { version: nextVersion } : {}),
      })
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.id, id)))
      .returning();

    if (configChanged && row) await this.snapshotVersion(this.db, row, nextVersion);
    return row;
  }

  /**
   * Snapshot the agent's current config into agent_versions. `skills` is the
   * ordered `[{ skill_id, version, enabled }]` list (Decision 9) so a run is
   * reproducible. Runs on `db` so it can join a surrounding transaction.
   */
  private async snapshotVersion(db: Db | Tx, row: AgentRow, version: number): Promise<void> {
    const links = await this.linkedSkills(row.id, db);
    await db
      .insert(t.agentVersions)
      .values({
        agentId: row.id,
        version,
        configJson: {
          provider: row.provider,
          model: row.model,
          system_prompt: row.systemPrompt,
          output_schema: row.outputSchema,
          strategy: row.strategy,
          ci_fail_on: row.ciFailOn,
          repo_intel: row.repoIntel,
          skills: links.map((l) => ({
            skill_id: l.skill.id,
            version: l.skill.version,
            enabled: l.enabled,
          })),
        },
      })
      .onConflictDoNothing();
  }

  // ---- agent_versions (immutable config snapshots) ------------------------

  /** All config snapshots for an agent, newest version first. */
  async listVersions(agentId: string): Promise<AgentVersionRow[]> {
    return this.db
      .select()
      .from(t.agentVersions)
      .where(eq(t.agentVersions.agentId, agentId))
      .orderBy(desc(t.agentVersions.version));
  }

  /** A single config snapshot, or undefined if that version was never recorded. */
  async getVersion(agentId: string, version: number): Promise<AgentVersionRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.agentVersions)
      .where(and(eq(t.agentVersions.agentId, agentId), eq(t.agentVersions.version, version)));
    return row;
  }

  // ---- agent_skills link table (A2 owns the agent side) -------------------

  /** Skills linked to an agent, in `order` ascending. */
  async linkedSkills(agentId: string, db: Db | Tx = this.db): Promise<LinkedSkillRow[]> {
    const rows = await db
      .select({ skill: t.skills, order: t.agentSkills.order, enabled: t.agentSkills.enabled })
      .from(t.agentSkills)
      .innerJoin(t.skills, eq(t.agentSkills.skillId, t.skills.id))
      .where(eq(t.agentSkills.agentId, agentId))
      .orderBy(asc(t.agentSkills.order));
    return rows.map((r) => ({ skill: r.skill, order: r.order, enabled: r.enabled }));
  }

  async skillIdsForAgent(agentId: string): Promise<string[]> {
    const links = await this.linkedSkills(agentId);
    return links.map((l) => l.skill.id);
  }

  /** Subset of `skillIds` that exist in `workspaceId` (cross-tenant / unknown ids drop out). */
  async skillIdsInWorkspace(workspaceId: string, skillIds: string[]): Promise<Set<string>> {
    if (skillIds.length === 0) return new Set();
    const rows = await this.db
      .select({ id: t.skills.id })
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), inArray(t.skills.id, skillIds)));
    return new Set(rows.map((r) => r.id));
  }

  /** Per-agent count of enabled links whose skill is enabled (agent card badge). */
  async skillCounts(workspaceId: string): Promise<Map<string, number>> {
    const rows = await this.db
      .select({ agentId: t.agentSkills.agentId, n: sql<number>`count(*)::int` })
      .from(t.agentSkills)
      .innerJoin(t.agents, eq(t.agents.id, t.agentSkills.agentId))
      .innerJoin(t.skills, eq(t.skills.id, t.agentSkills.skillId))
      .where(
        and(
          eq(t.agents.workspaceId, workspaceId),
          eq(t.agentSkills.enabled, true),
          eq(t.skills.enabled, true),
        ),
      )
      .groupBy(t.agentSkills.agentId);
    return new Map(rows.map((r) => [r.agentId, r.n]));
  }

  /**
   * Replace the full ordered set of links (order = index) in ONE transaction
   * and, when the set actually changed, bump `agents.version` + snapshot
   * (Decision 9). Returns undefined when the agent isn't in the workspace.
   * The agent row is locked so concurrent link edits can't race the version.
   */
  async setSkillItems(
    workspaceId: string,
    agentId: string,
    items: SkillLinkItem[],
  ): Promise<{ bumped: boolean } | undefined> {
    return this.db.transaction(async (tx) => {
      const [agent] = await tx
        .select()
        .from(t.agents)
        .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.id, agentId)))
        .for('update');
      if (!agent) return undefined;

      const before = await this.linkedSkills(agentId, tx);
      const prev = before.map((l) => ({ skill_id: l.skill.id, enabled: l.enabled }));
      if (sameSkillLinks(prev, items)) return { bumped: false };

      await tx.delete(t.agentSkills).where(eq(t.agentSkills.agentId, agentId));
      if (items.length > 0) {
        await tx.insert(t.agentSkills).values(
          items.map((it, i) => ({
            agentId,
            skillId: it.skill_id,
            order: i,
            enabled: it.enabled,
          })),
        );
      }
      const nextVersion = agent.version + 1;
      const [row] = await tx
        .update(t.agents)
        .set({ version: nextVersion })
        .where(eq(t.agents.id, agentId))
        .returning();
      await this.snapshotVersion(tx, row!, nextVersion);
      return { bumped: true };
    });
  }

  /**
   * Link one skill at `order` (or append), idempotent, in one transaction;
   * bumps the agent version when the link is new or its order changed.
   * Returns undefined when the agent isn't in the workspace.
   */
  async linkSkill(
    workspaceId: string,
    agentId: string,
    skillId: string,
    order?: number,
  ): Promise<{ bumped: boolean } | undefined> {
    return this.db.transaction(async (tx) => {
      const [agent] = await tx
        .select()
        .from(t.agents)
        .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.id, agentId)))
        .for('update');
      if (!agent) return undefined;

      const existing = await this.linkedSkills(agentId, tx);
      const current = existing.find((l) => l.skill.id === skillId);
      // No explicit order: keep an existing link where it is, else append.
      const resolvedOrder = order ?? current?.order ?? existing.length;
      if (current && current.order === resolvedOrder) return { bumped: false };

      await tx
        .insert(t.agentSkills)
        .values({ agentId, skillId, order: resolvedOrder })
        .onConflictDoUpdate({
          target: [t.agentSkills.agentId, t.agentSkills.skillId],
          set: { order: resolvedOrder },
        });
      const nextVersion = agent.version + 1;
      const [row] = await tx
        .update(t.agents)
        .set({ version: nextVersion })
        .where(eq(t.agents.id, agentId))
        .returning();
      await this.snapshotVersion(tx, row!, nextVersion);
      return { bumped: true };
    });
  }
}
