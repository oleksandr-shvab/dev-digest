import type { Container } from '../../platform/container.js';
import type {
  Agent,
  AgentSkill,
  AgentSkillLink,
  AgentVersion,
  CiFailOn,
  ModelInfo,
  Provider,
  ReviewStrategy,
} from '@devdigest/shared';
import { AgentsRepository } from './repository.js';
import { ValidationError } from '../../platform/errors.js';
import { toAgentDto, toAgentSkillDtos, toAgentVersionDto, type SkillLinkItem } from './helpers.js';

/**
 * A2 — agents service. Business logic for the Agents tab + Agent Editor.
 * Provider/model selection uses the LLM adapter's dynamic model list.
 *
 * An Agent = provider + model + system_prompt + linked skills + output_schema +
 * enabled. Config changes are versioned via `agent_versions` (repository).
 */

// Re-exported for backwards compatibility; implementation lives in ./helpers.
export { toAgentDto } from './helpers.js';

export interface CreateAgentInput {
  name: string;
  description?: string;
  provider: Provider;
  model: string;
  system_prompt: string;
  output_schema?: unknown;
  strategy?: ReviewStrategy;
  ci_fail_on?: CiFailOn;
  repo_intel?: boolean;
  enabled?: boolean;
}

export interface UpdateAgentInput {
  name?: string;
  description?: string;
  provider?: Provider;
  model?: string;
  system_prompt?: string;
  output_schema?: unknown;
  strategy?: ReviewStrategy;
  ci_fail_on?: CiFailOn;
  repo_intel?: boolean;
  enabled?: boolean;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class AgentsService {
  private repo: AgentsRepository;

  constructor(private container: Container) {
    this.repo = new AgentsRepository(container.db);
  }

  async list(workspaceId: string): Promise<Agent[]> {
    const [rows, counts] = await Promise.all([
      this.repo.list(workspaceId),
      this.repo.skillCounts(workspaceId),
    ]);
    return rows.map((row) => toAgentDto(row, counts.get(row.id) ?? 0));
  }

  async get(workspaceId: string, id: string): Promise<Agent | undefined> {
    const row = await this.repo.getById(workspaceId, id);
    if (!row) return undefined;
    const counts = await this.repo.skillCounts(workspaceId);
    return toAgentDto(row, counts.get(row.id) ?? 0);
  }

  /** Delete an agent (and its versions/skill-links, via cascade). */
  async delete(workspaceId: string, id: string): Promise<boolean> {
    return this.repo.deleteById(workspaceId, id);
  }

  async create(workspaceId: string, input: CreateAgentInput, userId?: string): Promise<Agent> {
    const row = await this.repo.insert({
      workspaceId,
      name: input.name,
      description: input.description,
      provider: input.provider,
      model: input.model,
      systemPrompt: input.system_prompt,
      outputSchema: input.output_schema,
      ...(input.strategy !== undefined ? { strategy: input.strategy } : {}),
      ...(input.ci_fail_on !== undefined ? { ciFailOn: input.ci_fail_on } : {}),
      ...(input.repo_intel !== undefined ? { repoIntel: input.repo_intel } : {}),
      enabled: input.enabled,
      createdBy: userId ?? null,
    });
    return toAgentDto(row);
  }

  async update(
    workspaceId: string,
    id: string,
    patch: UpdateAgentInput,
  ): Promise<Agent | undefined> {
    const row = await this.repo.update(workspaceId, id, {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.provider !== undefined ? { provider: patch.provider } : {}),
      ...(patch.model !== undefined ? { model: patch.model } : {}),
      ...(patch.system_prompt !== undefined ? { systemPrompt: patch.system_prompt } : {}),
      ...(patch.output_schema !== undefined ? { outputSchema: patch.output_schema } : {}),
      ...(patch.strategy !== undefined ? { strategy: patch.strategy } : {}),
      ...(patch.ci_fail_on !== undefined ? { ciFailOn: patch.ci_fail_on } : {}),
      ...(patch.repo_intel !== undefined ? { repoIntel: patch.repo_intel } : {}),
      ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
    });
    return row ? toAgentDto(row) : undefined;
  }

  /**
   * Config history for an agent, newest version first. Workspace-scoped: returns
   * undefined when the agent isn't in this workspace (the route maps that to 404)
   * so version snapshots can't be read across tenants.
   */
  async listVersions(workspaceId: string, agentId: string): Promise<AgentVersion[] | undefined> {
    const agent = await this.repo.getById(workspaceId, agentId);
    if (!agent) return undefined;
    const rows = await this.repo.listVersions(agentId);
    return rows.map(toAgentVersionDto);
  }

  /**
   * A single config snapshot for an agent. Returns undefined when the agent isn't
   * in this workspace OR that version was never recorded (route → 404).
   */
  async getVersion(
    workspaceId: string,
    agentId: string,
    version: number,
  ): Promise<AgentVersion | undefined> {
    const agent = await this.repo.getById(workspaceId, agentId);
    if (!agent) return undefined;
    const row = await this.repo.getVersion(agentId, version);
    return row ? toAgentVersionDto(row) : undefined;
  }

  /** Linked skills for an agent as AgentSkillLink[] (ordered). */
  async skillLinks(agentId: string): Promise<AgentSkillLink[]> {
    const links = await this.repo.linkedSkills(agentId);
    return links.map((l) => ({ agent_id: agentId, skill_id: l.skill.id, order: l.order }));
  }

  /** Linked skills with their per-agent flag, in prompt order (`GET /agents/:id/skills`). */
  async agentSkills(workspaceId: string, agentId: string): Promise<AgentSkill[] | undefined> {
    const agent = await this.repo.getById(workspaceId, agentId);
    if (!agent) return undefined;
    return toAgentSkillDtos(await this.repo.linkedSkills(agentId));
  }

  /**
   * Replace the agent's full ordered skill set (`PUT /agents/:id/skills`) in one
   * transaction and bump the agent version. Every skill_id must exist in this
   * workspace (else 422) and appear once.
   */
  async setAgentSkills(
    workspaceId: string,
    agentId: string,
    items: SkillLinkItem[],
  ): Promise<AgentSkill[] | undefined> {
    const agent = await this.repo.getById(workspaceId, agentId);
    if (!agent) return undefined;
    await this.assertSkillsInWorkspace(
      workspaceId,
      items.map((i) => i.skill_id),
    );
    const res = await this.repo.setSkillItems(workspaceId, agentId, items);
    if (!res) return undefined;
    return toAgentSkillDtos(await this.repo.linkedSkills(agentId));
  }

  /**
   * Legacy `POST /agents/:id/skills` (set/reorder by ids). Keeps each existing
   * link's per-agent `enabled` flag; new links default to enabled.
   */
  async setSkills(
    workspaceId: string,
    agentId: string,
    skillIds: string[],
  ): Promise<AgentSkillLink[] | undefined> {
    const agent = await this.repo.getById(workspaceId, agentId);
    if (!agent) return undefined;
    await this.assertSkillsInWorkspace(workspaceId, skillIds);
    const existing = new Map(
      (await this.repo.linkedSkills(agentId)).map((l) => [l.skill.id, l.enabled]),
    );
    const res = await this.repo.setSkillItems(
      workspaceId,
      agentId,
      skillIds.map((skill_id) => ({ skill_id, enabled: existing.get(skill_id) ?? true })),
    );
    if (!res) return undefined;
    return this.skillLinks(agentId);
  }

  /** Legacy link-one (append or set order) — additive; transactional + bumps the version. */
  async linkSkill(
    workspaceId: string,
    agentId: string,
    skillId: string,
    order?: number,
  ): Promise<AgentSkillLink[] | undefined> {
    const agent = await this.repo.getById(workspaceId, agentId);
    if (!agent) return undefined;
    await this.assertSkillsInWorkspace(workspaceId, [skillId]);
    const res = await this.repo.linkSkill(workspaceId, agentId, skillId, order);
    if (!res) return undefined;
    return this.skillLinks(agentId);
  }

  /** 422 when a skill id is unknown / belongs to another workspace / is repeated. */
  private async assertSkillsInWorkspace(workspaceId: string, skillIds: string[]): Promise<void> {
    if (new Set(skillIds).size !== skillIds.length) {
      throw new ValidationError('Duplicate skill_id in items');
    }
    // The shared contract types ids as plain strings; a non-uuid can never exist
    // (and would make Postgres throw), so treat it as unknown without querying.
    const known = await this.repo.skillIdsInWorkspace(
      workspaceId,
      skillIds.filter((id) => UUID_RE.test(id)),
    );
    const unknown = skillIds.filter((id) => !known.has(id));
    if (unknown.length > 0) {
      throw new ValidationError('Unknown skill_id', { skill_ids: unknown });
    }
  }

  /**
   * Dynamic model list from the provider adapter's /models. Degrades gracefully
   * to [] if the provider key is not configured (the editor still renders).
   */
  async listModels(provider: Provider): Promise<ModelInfo[]> {
    try {
      const llm = await this.container.llm(provider);
      return await llm.listModels();
    } catch {
      return [];
    }
  }
}
