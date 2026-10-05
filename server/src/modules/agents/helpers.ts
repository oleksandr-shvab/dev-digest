import type { Agent, AgentVersion, CiFailOn, Provider, ReviewStrategy } from '@devdigest/shared';
import { AgentVersionConfig } from '@devdigest/shared';
import type { AgentSkill } from '@devdigest/shared';
import type { LinkedSkillRow } from './repository.js';
import { toSkillDto } from '../skills/helpers.js';
import type { AgentRow, AgentVersionRow } from './repository.js';

/**
 * Pure helpers for the agents module — DB row ⇄ DTO mapping and the
 * config-version-bump rule. No I/O; behaviour-identical to the previous inline
 * implementations.
 */

/** Map a persisted agent row to the public `Agent` DTO. */
export function toAgentDto(row: AgentRow, skillCount?: number): Agent {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    provider: row.provider as Provider,
    model: row.model,
    system_prompt: row.systemPrompt,
    output_schema: row.outputSchema ?? null,
    enabled: row.enabled,
    version: row.version,
    strategy: row.strategy as ReviewStrategy,
    ci_fail_on: row.ciFailOn as CiFailOn,
    repo_intel: row.repoIntel,
    ...(skillCount !== undefined ? { skill_count: skillCount } : {}),
  };
}

/**
 * Map a persisted `agent_versions` row to the public `AgentVersion` DTO. The
 * stored `config_json` is untyped jsonb (a snapshot from an older config shape
 * could drift), so it is parsed through `AgentVersionConfig` — a malformed
 * snapshot throws here rather than leaking an unvalidated blob to the client.
 */
export function toAgentVersionDto(row: AgentVersionRow): AgentVersion {
  return {
    agent_id: row.agentId,
    version: row.version,
    config: AgentVersionConfig.parse(upgradeVersionConfig(row.configJson)),
    created_at: row.createdAt.toISOString(),
  };
}

/**
 * Snapshots written before skills carried a version/enabled flag stored
 * `skills` as `string[]` (skill ids). Upgrade them to the current
 * `[{ skill_id, version, enabled }]` shape so old history stays readable.
 */
export function upgradeVersionConfig(json: unknown): unknown {
  if (!json || typeof json !== 'object') return json;
  const cfg = json as { skills?: unknown };
  if (!Array.isArray(cfg.skills)) return { ...cfg, skills: [] };
  return {
    ...cfg,
    skills: cfg.skills.map((s) =>
      typeof s === 'string' ? { skill_id: s, version: 1, enabled: true } : s,
    ),
  };
}

/** An ordered agent↔skill link as stored (skill id + per-agent enabled flag). */
export interface SkillLinkItem {
  skill_id: string;
  enabled: boolean;
}

/** True when two ordered link sets are identical (ids, order and enabled flags). */
export function sameSkillLinks(a: SkillLinkItem[], b: SkillLinkItem[]): boolean {
  return (
    a.length === b.length &&
    a.every((x, i) => x.skill_id === b[i]!.skill_id && x.enabled === b[i]!.enabled)
  );
}

/** Map linked-skill rows to the public `AgentSkill[]` (already in prompt order). */
export function toAgentSkillDtos(links: LinkedSkillRow[]): AgentSkill[] {
  return links.map((l) => ({ skill: toSkillDto(l.skill), order: l.order, enabled: l.enabled }));
}

/** Fields whose change bumps the agent's config version (anything but `enabled`). */
export interface ConfigChangePatch {
  name?: string;
  description?: string;
  provider?: Provider;
  model?: string;
  systemPrompt?: string;
  outputSchema?: unknown;
  strategy?: ReviewStrategy;
  ciFailOn?: CiFailOn;
  repoIntel?: boolean;
}

/**
 * True when a patch changes config (vs. just toggling `enabled`) relative to the
 * existing row — a config change bumps the version and snapshots agent_versions.
 */
export function isConfigChange(
  existing: Pick<
    AgentRow,
    | 'name'
    | 'description'
    | 'provider'
    | 'model'
    | 'systemPrompt'
    | 'strategy'
    | 'ciFailOn'
    | 'repoIntel'
  >,
  patch: ConfigChangePatch,
): boolean {
  return (
    (patch.name !== undefined && patch.name !== existing.name) ||
    (patch.description !== undefined && patch.description !== existing.description) ||
    (patch.provider !== undefined && patch.provider !== existing.provider) ||
    (patch.model !== undefined && patch.model !== existing.model) ||
    (patch.systemPrompt !== undefined && patch.systemPrompt !== existing.systemPrompt) ||
    (patch.strategy !== undefined && patch.strategy !== existing.strategy) ||
    (patch.ciFailOn !== undefined && patch.ciFailOn !== existing.ciFailOn) ||
    (patch.repoIntel !== undefined && patch.repoIntel !== existing.repoIntel) ||
    patch.outputSchema !== undefined
  );
}
