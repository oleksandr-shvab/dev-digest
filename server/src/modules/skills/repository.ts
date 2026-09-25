import { and, asc, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { SkillRow, SkillVersionRow } from '../../db/rows.js';
import type { SkillStats } from '@devdigest/shared';
import { INITIAL_SKILL_VERSION } from './constants.js';
import type { SkillUpdatePatch } from './helpers.js';
import { planSkillUpdate } from './helpers.js';
import { EMPTY_COUNTS, type SkillStatCounts } from './stats.js';

/**
 * Skills data-access. The ONLY layer touching the DB for the skills domain:
 * `skills`, `skill_versions`, plus the read-only stats queries over
 * `agent_skills` / `run_skills` / `agent_runs` / `reviews` / `findings`.
 * Workspace-scoped throughout. Multi-row writes (skill + version) are
 * transactional. The pure ratio rules live in `stats.ts`.
 */
export type { SkillRow, SkillVersionRow };

export interface InsertSkill {
  workspaceId: string;
  name: string;
  description: string;
  type: SkillRow['type'];
  source: SkillRow['source'];
  body: string;
  enabled?: boolean;
  /** Message stored on v1. */
  message: string;
}

/** Result of an update: the row after the write, and the new version (if any). */
export interface UpdateSkillResult {
  row: SkillRow;
  versioned: boolean;
}

export class SkillsRepository {
  constructor(private db: Db) {}

  async list(workspaceId: string): Promise<SkillRow[]> {
    return this.db
      .select()
      .from(t.skills)
      .where(eq(t.skills.workspaceId, workspaceId))
      .orderBy(asc(t.skills.name));
  }

  async getById(workspaceId: string, id: string): Promise<SkillRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)));
    return row;
  }

  async getByName(workspaceId: string, name: string): Promise<SkillRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.name, name)));
    return row;
  }

  /** Insert a skill AND its v1 snapshot in one transaction. */
  async create(values: InsertSkill): Promise<SkillRow> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(t.skills)
        .values({
          workspaceId: values.workspaceId,
          name: values.name,
          description: values.description,
          type: values.type,
          source: values.source,
          body: values.body,
          enabled: values.enabled ?? true,
          version: INITIAL_SKILL_VERSION,
        })
        .returning();
      await tx.insert(t.skillVersions).values({
        skillId: row!.id,
        version: INITIAL_SKILL_VERSION,
        body: row!.body,
        description: row!.description,
        type: row!.type,
        message: values.message,
      });
      return row!;
    });
  }

  /**
   * Partial update. Prompt-affecting changes (body/description/type) bump
   * `skills.version` and snapshot into `skill_versions` with `message`
   * (Decision 6); renaming / toggling `enabled` never does. The row is locked
   * for the read-decide-write so concurrent saves can't collide on a version.
   */
  async update(
    workspaceId: string,
    id: string,
    patch: SkillUpdatePatch,
    message: string,
  ): Promise<UpdateSkillResult | undefined> {
    return this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(t.skills)
        .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
        .for('update');
      if (!existing) return undefined;

      const plan = planSkillUpdate(existing, patch);
      if (!plan.changed) return { row: existing, versioned: false };

      const nextVersion = plan.bump ? existing.version + 1 : existing.version;
      const [row] = await tx
        .update(t.skills)
        .set({ ...plan.set, ...(plan.bump ? { version: nextVersion } : {}), updatedAt: new Date() })
        .where(eq(t.skills.id, id))
        .returning();
      if (plan.bump) {
        await tx.insert(t.skillVersions).values({
          skillId: id,
          version: nextVersion,
          body: row!.body,
          description: row!.description,
          type: row!.type,
          message,
        });
      }
      return { row: row!, versioned: plan.bump };
    });
  }

  /** Delete a skill (links, versions and run_skills cascade). */
  async deleteById(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
      .returning({ id: t.skills.id });
    return rows.length > 0;
  }

  // ---- versions -----------------------------------------------------------

  /** Snapshots newest first. */
  async listVersions(skillId: string): Promise<SkillVersionRow[]> {
    return this.db
      .select()
      .from(t.skillVersions)
      .where(eq(t.skillVersions.skillId, skillId))
      .orderBy(desc(t.skillVersions.version));
  }

  async getVersion(skillId: string, version: number): Promise<SkillVersionRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skillVersions)
      .where(and(eq(t.skillVersions.skillId, skillId), eq(t.skillVersions.version, version)));
    return row;
  }

  /**
   * Restore vN: copy its body/description/type into version `current + 1`
   * (Decision 8). History is never rewritten. Returns undefined when the skill
   * or that version doesn't exist.
   */
  async restoreVersion(
    workspaceId: string,
    id: string,
    version: number,
    message: string,
  ): Promise<SkillRow | undefined> {
    return this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(t.skills)
        .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
        .for('update');
      if (!existing) return undefined;
      const [snap] = await tx
        .select()
        .from(t.skillVersions)
        .where(and(eq(t.skillVersions.skillId, id), eq(t.skillVersions.version, version)));
      if (!snap) return undefined;

      const nextVersion = existing.version + 1;
      const [row] = await tx
        .update(t.skills)
        .set({
          body: snap.body,
          description: snap.description,
          type: snap.type,
          version: nextVersion,
          updatedAt: new Date(),
        })
        .where(eq(t.skills.id, id))
        .returning();
      await tx.insert(t.skillVersions).values({
        skillId: id,
        version: nextVersion,
        body: snap.body,
        description: snap.description,
        type: snap.type,
        message,
      });
      return row!;
    });
  }

  // ---- stats (SQL only; ratio rules live in stats.ts) ----------------------

  /** Done runs inside the window (`agent_runs.ran_at`). */
  private windowRuns(since: Date) {
    return and(eq(t.agentRuns.status, 'done'), gte(t.agentRuns.ranAt, since));
  }

  /**
   * Raw counts for many skills with grouped queries (no per-skill N+1). Skills
   * with no data get zero counts. Callers must pass workspace-scoped ids.
   */
  async statCounts(skillIds: string[], since: Date): Promise<Map<string, SkillStatCounts>> {
    const out = new Map<string, SkillStatCounts>(
      skillIds.map((id) => [id, { ...EMPTY_COUNTS }]),
    );
    if (skillIds.length === 0) return out;
    const runsInWindow = this.windowRuns(since);

    const [usedBy, applied, linkedRuns, findings] = await Promise.all([
      this.db
        .select({ skillId: t.agentSkills.skillId, n: sql<number>`count(*)::int` })
        .from(t.agentSkills)
        .where(inArray(t.agentSkills.skillId, skillIds))
        .groupBy(t.agentSkills.skillId),
      this.db
        .select({ skillId: t.runSkills.skillId, n: sql<number>`count(*)::int` })
        .from(t.runSkills)
        .innerJoin(t.agentRuns, eq(t.agentRuns.id, t.runSkills.runId))
        .where(and(inArray(t.runSkills.skillId, skillIds), runsInWindow))
        .groupBy(t.runSkills.skillId),
      this.db
        .select({ skillId: t.agentSkills.skillId, n: sql<number>`count(*)::int` })
        .from(t.agentSkills)
        .innerJoin(t.agentRuns, eq(t.agentRuns.agentId, t.agentSkills.agentId))
        .where(and(inArray(t.agentSkills.skillId, skillIds), runsInWindow))
        .groupBy(t.agentSkills.skillId),
      this.db
        .select({
          skillId: t.runSkills.skillId,
          total: sql<number>`count(*)::int`,
          accepted: sql<number>`(count(*) filter (where ${t.findings.acceptedAt} is not null))::int`,
          dismissed: sql<number>`(count(*) filter (where ${t.findings.dismissedAt} is not null))::int`,
        })
        .from(t.runSkills)
        .innerJoin(t.agentRuns, eq(t.agentRuns.id, t.runSkills.runId))
        .innerJoin(t.reviews, eq(t.reviews.runId, t.agentRuns.id))
        .innerJoin(t.findings, eq(t.findings.reviewId, t.reviews.id))
        .where(and(inArray(t.runSkills.skillId, skillIds), runsInWindow))
        .groupBy(t.runSkills.skillId),
    ]);

    for (const r of usedBy) out.get(r.skillId)!.usedBy = r.n;
    for (const r of applied) out.get(r.skillId)!.appliedRuns = r.n;
    for (const r of linkedRuns) out.get(r.skillId)!.linkedAgentRuns = r.n;
    for (const r of findings) {
      const c = out.get(r.skillId)!;
      c.findings = r.total;
      c.accepted = r.accepted;
      c.dismissed = r.dismissed;
    }
    return out;
  }

  /** Findings of runs that applied the skill, grouped by category (30-day window). */
  async findingsByCategory(skillId: string, since: Date): Promise<SkillStats['by_category']> {
    return this.db
      .select({ category: t.findings.category, count: sql<number>`count(*)::int` })
      .from(t.runSkills)
      .innerJoin(t.agentRuns, eq(t.agentRuns.id, t.runSkills.runId))
      .innerJoin(t.reviews, eq(t.reviews.runId, t.agentRuns.id))
      .innerJoin(t.findings, eq(t.findings.reviewId, t.reviews.id))
      .where(and(eq(t.runSkills.skillId, skillId), this.windowRuns(since)))
      .groupBy(t.findings.category)
      .orderBy(desc(sql`count(*)`), asc(t.findings.category));
  }

  /** Agents linking the skill (any enabled state), name ASC. */
  async linkedAgents(skillId: string): Promise<SkillStats['agents']> {
    return this.db
      .select({ id: t.agents.id, name: t.agents.name, enabled: t.agentSkills.enabled })
      .from(t.agentSkills)
      .innerJoin(t.agents, eq(t.agents.id, t.agentSkills.agentId))
      .where(eq(t.agentSkills.skillId, skillId))
      .orderBy(asc(t.agents.name));
  }
}
