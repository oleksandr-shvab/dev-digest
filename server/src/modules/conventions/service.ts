import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  ConventionCandidate,
  ConventionPatch,
  ConventionScanResult,
  ConventionSkillDraft,
  CreateConventionSkill,
  Skill,
} from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { AppError, ConflictError, NotFoundError } from '../../platform/errors.js';
import { RepoRepository } from '../repos/repository.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { SkillsService } from '../skills/service.js';
import { AgentsService } from '../agents/service.js';
import { ConventionsRepository, type ConventionRow, type InsertConvention } from './repository.js';
import { findDuplicateReason, planConventionPatch, toConventionDto } from './helpers.js';
import { buildSamples, findConfigPaths, type DirEntry, type RepoFileSystem } from './sampling.js';
import { createEvidenceChecker } from './evidence.js';
import {
  buildConventionsUserMessage,
  CONVENTIONS_SYSTEM_PROMPT,
  CONVENTION_EXTRACTION_SCHEMA_NAME,
  ConventionExtractionSchema,
} from './prompt.js';
import { buildSkillDraft } from './skill-draft.js';
import { CODE_SAMPLE_FILES, EXTRACT_TIMEOUT_MS } from './constants.js';

/**
 * Conventions service — extraction pipeline, triage and skill creation
 * (server/specs/conventions.md). Lookups return `undefined` for "not found in
 * this workspace"; the routes map that to 404.
 */

/** Reads a repo's clone on disk (server/specs/conventions.md — sampling is code only). */
function cloneFileSystem(clonePath: string): RepoFileSystem {
  return {
    async listDir(dir: string): Promise<DirEntry[]> {
      const entries = await readdir(join(clonePath, dir), { withFileTypes: true });
      return entries.map((e) => ({ name: e.name, isDirectory: e.isDirectory() }));
    },
    async readFile(path: string): Promise<string | null> {
      return readFile(join(clonePath, path), 'utf8').catch(() => null);
    },
  };
}

export class ConventionsService {
  private repo: ConventionsRepository;
  private repos: RepoRepository;
  private skills: SkillsService;
  private agents: AgentsService;

  constructor(private container: Container) {
    this.repo = new ConventionsRepository(container.db);
    this.repos = new RepoRepository(container.db);
    this.skills = new SkillsService(container);
    this.agents = new AgentsService(container);
  }

  /** Pending + accepted, confidence desc. */
  async list(workspaceId: string, repoId: string): Promise<ConventionCandidate[] | undefined> {
    const repo = await this.repos.getById(workspaceId, repoId);
    if (!repo) return undefined;
    const rows = await this.repo.listPendingAndAccepted(workspaceId, repoId);
    return rows.map(toConventionDto);
  }

  /**
   * Sample (code only) → ask the model once → verify every candidate's
   * evidence → dedupe against already-decided rows → replace `pending`.
   */
  async extract(workspaceId: string, repoId: string): Promise<ConventionScanResult> {
    const repo = await this.repos.getById(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');
    if (!repo.clonePath) {
      throw new AppError('repo_not_indexed', 'This repo has no clone yet — resync it first.', 409);
    }

    const fs = cloneFileSystem(repo.clonePath);
    const configPaths = await findConfigPaths(fs);
    const codePaths = await this.container.repoIntel.getConventionSamples(repoId, CODE_SAMPLE_FILES);
    const samples = await buildSamples(fs, configPaths, codePaths);
    if (samples.length === 0) {
      throw new AppError('repo_not_indexed', 'No sampleable files found — resync the repo first.', 409);
    }

    const { provider, model } = await resolveFeatureModel(this.container, workspaceId, 'conventions');
    const llm = await this.container.llm(provider);
    const result = await llm.completeStructured({
      model,
      schema: ConventionExtractionSchema,
      schemaName: CONVENTION_EXTRACTION_SCHEMA_NAME,
      temperature: 0,
      timeoutMs: EXTRACT_TIMEOUT_MS,
      messages: [
        { role: 'system', content: CONVENTIONS_SYSTEM_PROMPT },
        { role: 'user', content: buildConventionsUserMessage(repo.fullName, samples) },
      ],
    });

    const sampledPaths = new Set(samples.map((s) => s.path));
    const checker = createEvidenceChecker(sampledPaths, fs);
    const kept = await this.repo.listKept(repoId);

    const survivors: InsertConvention[] = [];
    const dropped: ConventionScanResult['dropped'] = [];
    for (const candidate of result.data.candidates) {
      const dupReason = findDuplicateReason(candidate.rule, kept);
      if (dupReason) {
        dropped.push({ rule: candidate.rule, reason: dupReason });
        continue;
      }
      const evidence = await checker.verify(candidate.evidence);
      if (!evidence.ok) {
        dropped.push({ rule: candidate.rule, reason: evidence.reason });
        continue;
      }
      survivors.push({
        workspaceId,
        repoId,
        category: candidate.category,
        rule: candidate.rule,
        evidencePath: candidate.evidence.path.replace(/^\.\//, ''),
        evidenceLine: evidence.line,
        evidenceSnippet: candidate.evidence.snippet,
        confidence: candidate.confidence,
      });
    }

    await this.repo.replacePending(repoId, survivors);
    const candidates = (await this.repo.listPendingAndAccepted(workspaceId, repoId)).map(toConventionDto);

    return { candidates, samples: [...sampledPaths], dropped, model };
  }

  async patch(workspaceId: string, id: string, patch: ConventionPatch): Promise<ConventionCandidate | undefined> {
    const existing = await this.repo.getById(workspaceId, id);
    if (!existing) return undefined;
    const plan = planConventionPatch(existing, patch);
    if (!plan.changed) return toConventionDto(existing);
    const row = await this.repo.update(workspaceId, id, plan.set);
    return row ? toConventionDto(row) : undefined;
  }

  async skillDraft(
    workspaceId: string,
    repoId: string,
    candidateIds: string[],
  ): Promise<ConventionSkillDraft | undefined> {
    const repo = await this.repos.getById(workspaceId, repoId);
    if (!repo) return undefined;
    const accepted = await this.assertAllAccepted(workspaceId, repoId, candidateIds);
    return buildSkillDraft(repo.fullName, accepted.map(toConventionDto));
  }

  /**
   * One skill named `input.name` (default `repo-conventions`) from the
   * accepted candidates, linked to every agent in `input.agent_ids`
   * (Decisions 11–12). Re-extracting onto an existing `extracted` skill saves
   * a new version instead of a second skill; a manual skill with the same
   * name is a conflict.
   */
  async createSkill(
    workspaceId: string,
    repoId: string,
    input: CreateConventionSkill,
  ): Promise<{ skill: Skill; created: boolean } | undefined> {
    const repo = await this.repos.getById(workspaceId, repoId);
    if (!repo) return undefined;
    await this.assertAllAccepted(workspaceId, repoId, input.candidate_ids);

    const existing = await this.skills.getByName(workspaceId, input.name);
    if (existing && existing.source !== 'extracted') {
      throw new ConflictError(
        `A skill named "${input.name}" already exists and wasn't extracted from conventions`,
        { name: input.name },
      );
    }

    const skill = existing
      ? await this.skills.update(
          workspaceId,
          existing.id,
          {
            description: input.description,
            body: input.body,
            message: input.message ?? `Re-extracted from ${input.candidate_ids.length} conventions`,
          },
          { evidenceFiles: input.evidence_files },
        )
      : await this.skills.create(
          workspaceId,
          { name: input.name, description: input.description, type: 'convention', body: input.body },
          { source: 'extracted', evidenceFiles: input.evidence_files },
        );
    if (!skill) return undefined;

    for (const agentId of input.agent_ids) {
      await this.agents.linkSkill(workspaceId, agentId, skill.id);
    }
    return { skill, created: !existing };
  }

  /** 400 unless every id names an ACCEPTED candidate of this repo (spec: service.createSkill). */
  private async assertAllAccepted(
    workspaceId: string,
    repoId: string,
    candidateIds: string[],
  ): Promise<ConventionRow[]> {
    if (candidateIds.length === 0) {
      throw new AppError('invalid_candidate_ids', 'candidate_ids must not be empty', 400);
    }
    const rows = await this.repo.getByIds(workspaceId, repoId, candidateIds);
    const byId = new Map(rows.map((r) => [r.id, r]));
    const invalid = candidateIds.filter((id) => byId.get(id)?.status !== 'accepted');
    if (invalid.length > 0) {
      throw new AppError(
        'invalid_candidate_ids',
        'candidate_ids must all be accepted candidates of this repo',
        400,
        { candidate_ids: invalid },
      );
    }
    return candidateIds.map((id) => byId.get(id)!);
  }
}
