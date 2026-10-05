import type { Container } from '../../platform/container.js';
import type {
  Skill,
  SkillImportDraft,
  SkillInput,
  SkillSource,
  SkillStats,
  SkillVersion,
} from '@devdigest/shared';
import { ConflictError } from '../../platform/errors.js';
import { SkillsRepository, type SkillRow } from './repository.js';
import {
  defaultVersionMessage,
  isUniqueViolation,
  toSkillDto,
  toSkillVersionDto,
  type SkillUpdatePatch,
} from './helpers.js';
import { buildStats, buildSummary, windowStart } from './stats.js';
import { parseSkillImport } from './import/parse.js';

/**
 * Skills service — CRUD + versions + stats + import preview. Skills are text
 * only (Decision 1): nothing here executes or stores anything from an import.
 * Lookups return `undefined` for "not found in this workspace" and the routes
 * map that to 404.
 */

export type UpdateSkillInput = Partial<SkillInput>;

export class SkillsService {
  private repo: SkillsRepository;

  constructor(private container: Container) {
    this.repo = new SkillsRepository(container.db);
  }

  /** Workspace skills, name ASC, each with its 30-day summary (grouped queries, no N+1). */
  async list(workspaceId: string): Promise<Skill[]> {
    const rows = await this.repo.list(workspaceId);
    const counts = await this.repo.statCounts(
      rows.map((r) => r.id),
      windowStart(new Date()),
    );
    return rows.map((r) => toSkillDto(r, buildSummary(counts.get(r.id)!)));
  }

  async get(workspaceId: string, id: string): Promise<Skill | undefined> {
    const row = await this.repo.getById(workspaceId, id);
    return row ? this.withStats(row) : undefined;
  }

  /** Used by the conventions module to find/re-version the `repo-conventions` skill. */
  async getByName(workspaceId: string, name: string): Promise<Skill | undefined> {
    const row = await this.repo.getByName(workspaceId, name);
    return row ? this.withStats(row) : undefined;
  }

  /**
   * `internal` is set only by the conventions module (`source: 'extracted'` +
   * `evidenceFiles`) — the public `SkillInput.source` enum has no `'extracted'`
   * variant, so the HTTP API itself can never produce one.
   */
  async create(
    workspaceId: string,
    input: SkillInput,
    internal?: { source?: SkillSource; evidenceFiles?: string[] },
  ): Promise<Skill> {
    if (await this.repo.getByName(workspaceId, input.name)) throw this.duplicate(input.name);
    const source = internal?.source ?? input.source ?? 'manual';
    try {
      const row = await this.repo.create({
        workspaceId,
        name: input.name,
        description: input.description,
        type: input.type,
        source,
        body: input.body,
        ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
        ...(internal?.evidenceFiles !== undefined ? { evidenceFiles: internal.evidenceFiles } : {}),
        message: defaultVersionMessage({ initial: true, source, message: input.message }),
      });
      return await this.withStats(row);
    } catch (err) {
      if (isUniqueViolation(err)) throw this.duplicate(input.name);
      throw err;
    }
  }

  /** Partial update; body/description/type changes version the skill (Decisions 6–7). */
  async update(
    workspaceId: string,
    id: string,
    patch: UpdateSkillInput,
    internal?: { evidenceFiles?: string[] },
  ): Promise<Skill | undefined> {
    if (patch.name !== undefined) {
      const clash = await this.repo.getByName(workspaceId, patch.name);
      if (clash && clash.id !== id) throw this.duplicate(patch.name);
    }
    const set: SkillUpdatePatch = {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.type !== undefined ? { type: patch.type } : {}),
      ...(patch.body !== undefined ? { body: patch.body } : {}),
      ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
      ...(internal?.evidenceFiles !== undefined ? { evidenceFiles: internal.evidenceFiles } : {}),
    };
    try {
      const res = await this.repo.update(
        workspaceId,
        id,
        set,
        defaultVersionMessage({ initial: false, message: patch.message }),
      );
      return res ? await this.withStats(res.row) : undefined;
    } catch (err) {
      if (isUniqueViolation(err) && patch.name) throw this.duplicate(patch.name);
      throw err;
    }
  }

  async delete(workspaceId: string, id: string): Promise<boolean> {
    return this.repo.deleteById(workspaceId, id);
  }

  // ---- versions -----------------------------------------------------------

  async listVersions(workspaceId: string, id: string): Promise<SkillVersion[] | undefined> {
    const skill = await this.repo.getById(workspaceId, id);
    if (!skill) return undefined;
    const rows = await this.repo.listVersions(id);
    return rows.map((r) => toSkillVersionDto(r, skill.version));
  }

  async getVersion(
    workspaceId: string,
    id: string,
    version: number,
  ): Promise<SkillVersion | undefined> {
    const skill = await this.repo.getById(workspaceId, id);
    if (!skill) return undefined;
    const row = await this.repo.getVersion(id, version);
    return row ? toSkillVersionDto(row, skill.version) : undefined;
  }

  /** Decision 8: restoring vN creates version current+1 with "Restored from vN". */
  async restoreVersion(
    workspaceId: string,
    id: string,
    version: number,
  ): Promise<Skill | undefined> {
    const row = await this.repo.restoreVersion(workspaceId, id, version, `Restored from v${version}`);
    return row ? this.withStats(row) : undefined;
  }

  // ---- stats --------------------------------------------------------------

  async stats(workspaceId: string, id: string): Promise<SkillStats | undefined> {
    const skill = await this.repo.getById(workspaceId, id);
    if (!skill) return undefined;
    const since = windowStart(new Date());
    const [counts, agents, byCategory] = await Promise.all([
      this.repo.statCounts([id], since),
      this.repo.linkedAgents(id),
      this.repo.findingsByCategory(id, since),
    ]);
    return buildStats(counts.get(id)!, agents, byCategory);
  }

  // ---- import (two-step: preview never writes) ------------------------------

  /** Parse an uploaded file into a draft. No DB write; only reads to flag a name clash. */
  async previewImport(
    workspaceId: string,
    filename: string,
    bytes: Uint8Array,
  ): Promise<SkillImportDraft> {
    const draft = parseSkillImport(filename, bytes, (text) => this.container.tokenizer.count(text));
    const clash = await this.repo.getByName(workspaceId, draft.name);
    return { ...draft, name_conflict: clash !== undefined };
  }

  // ---- internals ----------------------------------------------------------

  private async withStats(row: SkillRow): Promise<Skill> {
    const counts = await this.repo.statCounts([row.id], windowStart(new Date()));
    return toSkillDto(row, buildSummary(counts.get(row.id)!));
  }

  private duplicate(name: string): ConflictError {
    return new ConflictError(`A skill named "${name}" already exists`, { name });
  }
}

