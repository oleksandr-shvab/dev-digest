import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/** The slice of a repo the module needs (no row types leak out). */
export interface ProjectContextRepoRow {
  id: string;
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
}

export interface UsageAttachments {
  /** Every agent of the workspace with its own attached paths. */
  agents: { id: string; contextPaths: string[] }[];
  /** One entry per agent<->skill link whose link flag AND skill flag are enabled. */
  links: { agentId: string; contextPaths: string[] }[];
}

/**
 * Project-context data-access: the only layer touching the DB for this module.
 * Read-only; attachments are written by the agents / skills repositories.
 * Workspace-scoped throughout.
 */
export class ProjectContextRepository {
  constructor(private db: Db) {}

  async getRepo(workspaceId: string, repoId: string): Promise<ProjectContextRepoRow | undefined> {
    const [row] = await this.db
      .select({
        id: t.repos.id,
        owner: t.repos.owner,
        name: t.repos.name,
        fullName: t.repos.fullName,
        defaultBranch: t.repos.defaultBranch,
      })
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row;
  }

  /** Two queries (agents, then enabled links); no per-agent round trips. */
  async attachmentsForUsage(workspaceId: string): Promise<UsageAttachments> {
    const agents = await this.db
      .select({ id: t.agents.id, contextPaths: t.agents.contextPaths })
      .from(t.agents)
      .where(eq(t.agents.workspaceId, workspaceId));
    const links = await this.db
      .select({ agentId: t.agentSkills.agentId, contextPaths: t.skills.contextPaths })
      .from(t.agentSkills)
      .innerJoin(t.agents, eq(t.agentSkills.agentId, t.agents.id))
      .innerJoin(t.skills, eq(t.agentSkills.skillId, t.skills.id))
      .where(
        and(
          eq(t.agents.workspaceId, workspaceId),
          eq(t.skills.workspaceId, workspaceId),
          eq(t.agentSkills.enabled, true),
          eq(t.skills.enabled, true),
        ),
      );
    return { agents, links };
  }
}
