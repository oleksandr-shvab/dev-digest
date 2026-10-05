import type { Skill, SkillInput, SkillStatsSummary, SkillVersion } from '@devdigest/shared';
import type { SkillRow, SkillVersionRow } from '../../db/rows.js';
import { MESSAGE_EDITED, MESSAGE_IMPORTED_PREFIX, MESSAGE_INITIAL } from './constants.js';

/**
 * Pure helpers for the skills module — DB row ⇄ DTO mapping, the prompt-block
 * formatter, the version rules and default version messages. No I/O.
 */

/** Map a persisted skill row to the public `Skill` DTO. */
export function toSkillDto(row: SkillRow, stats?: SkillStatsSummary): Skill {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    type: row.type,
    source: row.source,
    body: row.body,
    enabled: row.enabled,
    version: row.version,
    evidence_files: row.evidenceFiles ?? null,
    updated_at: row.updatedAt.toISOString(),
    ...(stats ? { stats } : {}),
  };
}

export function toSkillVersionDto(row: SkillVersionRow, currentVersion: number): SkillVersion {
  return {
    version: row.version,
    message: row.message,
    created_at: row.createdAt.toISOString(),
    body: row.body,
    description: row.description,
    type: row.type,
    current: row.version === currentVersion,
  };
}

/** kebab-case slug (`^[a-z0-9]+(-[a-z0-9]+)*$`, ≤ 64 chars); `skill` if nothing survives. */
export function slugifySkillName(input: string): string {
  const slug = input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/g, '');
  return slug || 'skill';
}

/** Minimal shape needed to render a skill into the prompt. */
export interface SkillBlockInput {
  name: string;
  version: number;
  description: string;
  body: string;
}

/** One `### name (vN)` block — the unit passed to `reviewPullRequest({ skills })`. */
export function formatSkillBlock(s: SkillBlockInput): string {
  return `### ${s.name} (v${s.version})\n${s.description}\n\n${s.body}`;
}

/**
 * Default version message (Decision 7). `"Initial version"` for manual v1,
 * `"Imported from <file>"` for imported v1, `"Edited"` otherwise. A non-blank
 * user message always wins.
 */
export function defaultVersionMessage(opts: {
  initial: boolean;
  source?: SkillRow['source'];
  fileName?: string;
  message?: string;
}): string {
  const given = opts.message?.trim();
  if (given) return given;
  if (!opts.initial) return MESSAGE_EDITED;
  if (opts.source === 'imported_file') {
    return `${MESSAGE_IMPORTED_PREFIX} ${opts.fileName ?? 'file'}`;
  }
  return MESSAGE_INITIAL;
}

export type SkillUpdatePatch = Partial<Pick<SkillInput, 'name' | 'description' | 'type' | 'body' | 'enabled'>> & {
  /** Internal-only (conventions re-extraction) — never settable via SkillInput. */
  evidenceFiles?: string[];
};

export interface SkillUpdatePlan {
  /** Column changes to apply (only fields that actually differ). */
  set: SkillUpdatePatch;
  /** True when body / description / type changed → bump version + snapshot (Decision 6). */
  bump: boolean;
  /** True when anything at all changed. */
  changed: boolean;
}

/**
 * Decide what a PUT does. Only `body`, `description` or `type` changes bump the
 * version; renaming or toggling `enabled` never creates a version.
 */
export function planSkillUpdate(
  existing: Pick<SkillRow, 'name' | 'description' | 'type' | 'body' | 'enabled'>,
  patch: SkillUpdatePatch,
): SkillUpdatePlan {
  const set: SkillUpdatePatch = {};
  if (patch.name !== undefined && patch.name !== existing.name) set.name = patch.name;
  if (patch.enabled !== undefined && patch.enabled !== existing.enabled) set.enabled = patch.enabled;
  if (patch.description !== undefined && patch.description !== existing.description) {
    set.description = patch.description;
  }
  if (patch.type !== undefined && patch.type !== existing.type) set.type = patch.type;
  if (patch.body !== undefined && patch.body !== existing.body) set.body = patch.body;
  if (patch.evidenceFiles !== undefined) set.evidenceFiles = patch.evidenceFiles;
  const bump = set.body !== undefined || set.description !== undefined || set.type !== undefined;
  return { set, bump, changed: Object.keys(set).length > 0 };
}

/** postgres-js unique_violation (SQLSTATE 23505). */
export function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } } | undefined;
  return e?.code === '23505' || e?.cause?.code === '23505';
}

/** A skill linked to an agent, as loaded for a run. */
export interface RunSkillLink {
  skill: SkillRow;
  order: number;
  /** agent_skills.enabled */
  enabled: boolean;
}

/**
 * The skills that reach a prompt (Decision 2): global `skills.enabled` AND
 * per-agent `agent_skills.enabled`, in `agent_skills.order ASC` (Decision 3).
 * Input order is not trusted — it is re-sorted here.
 */
export function activeSkillLinks<T extends RunSkillLink>(links: T[]): T[] {
  return links.filter((l) => l.enabled && l.skill.enabled).sort((a, b) => a.order - b.order);
}

/** Compact token figure for the run log: `410`, `~1.2k`. */
export function formatTokenCount(tokens: number): string {
  return tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}k` : String(tokens);
}

/** Run-log lines: a `Skills: N active · ~Xk tokens` header, then one line per skill. */
export function skillsLogLines(
  applied: { name: string; version: number; tokens: number }[],
): string[] {
  if (applied.length === 0) return [];
  const total = applied.reduce((sum, s) => sum + s.tokens, 0);
  return [
    `Skills: ${applied.length} active · ~${formatTokenCount(total)} tokens`,
    ...applied.map((s) => `  ${s.name} v${s.version} · ${s.tokens} tokens`),
  ];
}
