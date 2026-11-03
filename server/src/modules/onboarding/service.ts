import type { GitTreeEntry, OnboardingTourContent, OnboardingTourState, RepoRef } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { AppError, ConflictError, NotFoundError } from '../../platform/errors.js';
import { withTimeout } from '../../platform/resilience.js';
import { RepoRepository } from '../repos/repository.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import type { IndexState } from '../repo-intel/types.js';
import { GENERATION_TIMEOUT_MS, RANKED_FETCH, TOUR_SCHEMA_NAME } from './constants.js';
import { groundTour } from './grounding.js';
import { failureReason, readinessOf, toTourDto, type TourLogger } from './helpers.js';
import {
  isSecretPath,
  outlineDirs,
  pickContextFiles,
  renderPromptFiles,
  type PromptFileRef,
} from './inputs.js';
import {
  buildTourUserMessage,
  ONBOARDING_TOUR_SYSTEM_PROMPT,
  TourGenerationSchema,
} from './prompt.js';
import { OnboardingRepository } from './repository.js';
import { TourGenerationRegistry } from './registry.js';
import { pickCriticalFiles, pickReadingPath } from './selection.js';

/**
 * Onboarding tour service (plans/onboarding-tour.md). Reads the stored tour
 * and the generation state without any LLM call; generates on an explicit
 * request only, with exactly one structured completion, under a deadline.
 * Lookups return `undefined` for "not in this workspace"; routes map that to 404.
 */

const REGULAR_FILE_MODES = new Set(['100644', '100755']);

type RepoRow = NonNullable<Awaited<ReturnType<RepoRepository['getById']>>>;
type Readiness = ReturnType<typeof readinessOf>;

interface BuiltTour {
  content: OnboardingTourContent;
  state: IndexState;
}

export class OnboardingService {
  private repo: OnboardingRepository;
  private repos: RepoRepository;
  private registry = new TourGenerationRegistry();
  private timeoutMs: number;

  constructor(
    private container: Container,
    opts: { timeoutMs?: number } = {},
  ) {
    this.repo = new OnboardingRepository(container.db);
    this.repos = new RepoRepository(container.db);
    this.timeoutMs = opts.timeoutMs ?? GENERATION_TIMEOUT_MS;
  }

  /** Stored tour + generation status + index readiness. Never resolves an LLM provider. */
  async getState(workspaceId: string, repoId: string): Promise<OnboardingTourState | undefined> {
    const repo = await this.repos.getById(workspaceId, repoId);
    if (!repo) return undefined;
    return this.stateFor(repo, await this.readiness(repo));
  }

  /**
   * Starts a generation and returns at once with `generating: true`. The
   * check-and-set below has no `await` between `tryStart` and the conflict
   * decision, so two parallel requests cannot both start (AC-21).
   */
  async startGeneration(
    workspaceId: string,
    repoId: string,
    log: TourLogger,
  ): Promise<OnboardingTourState> {
    const repo = await this.repos.getById(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');

    if (!this.registry.tryStart(repoId)) {
      throw new ConflictError('A tour generation is already running for this repo');
    }

    let state: OnboardingTourState;
    try {
      const readiness = await this.readiness(repo);
      if (!readiness.ready) {
        throw new AppError('repo_not_indexed', 'Index this repository first', 409);
      }
      state = await this.stateFor(repo, readiness);
    } catch (err) {
      this.registry.cancel(repoId);
      throw err;
    }

    void this.run(workspaceId, repo, log);
    return state;
  }

  private async stateFor(repo: RepoRow, index: Readiness): Promise<OnboardingTourState> {
    const row = await this.repo.get(repo.id);
    const { generating, lastError } = this.registry.snapshot(repo.id);
    return {
      repo_id: repo.id,
      tour: toTourDto(row),
      generating,
      last_error: lastError,
      index,
    };
  }

  private async readiness(repo: RepoRow): Promise<Readiness> {
    let mirrorOk = true;
    try {
      await this.container.git.currentHead(this.refOf(repo));
    } catch {
      mirrorOk = false;
    }
    const state = await this.container.repoIntel.getIndexState(repo.id);
    return readinessOf({ mirrorOk, state });
  }

  private refOf(repo: RepoRow): RepoRef {
    return { owner: repo.owner, name: repo.name };
  }

  /** Fire-and-forget body. Never throws: every outcome lands in the registry. */
  private async run(workspaceId: string, repo: RepoRow, log: TourLogger): Promise<void> {
    try {
      // The store happens only after the deadline-guarded build resolves, so a
      // result that arrives late is discarded (AC-32).
      const { content, state } = await withTimeout(this.build(workspaceId, repo), this.timeoutMs);
      await this.repo.upsert({
        repoId: repo.id,
        json: content,
        generatedAt: new Date(),
        commitSha: state.lastIndexedSha,
        indexFileCount: state.filesIndexed,
        indexStatus: state.status,
      });
      this.registry.succeed(repo.id);
      log.info(
        {
          repoId: repo.id,
          criticalPaths: content.critical_paths.items.length,
          readingPath: content.reading_path.length,
          runSteps: content.run_steps.length,
          firstTasks: content.first_tasks.length,
        },
        'Onboarding tour generated',
      );
    } catch (err) {
      const reason = failureReason(err);
      this.registry.fail(repo.id, reason);
      log.warn({ repoId: repo.id, reason }, 'Onboarding tour generation failed');
    }
  }

  private async build(workspaceId: string, repo: RepoRow): Promise<BuiltTour> {
    const { git, repoIntel } = this.container;
    const ref = this.refOf(repo);

    const state = await repoIntel.getIndexState(repo.id);
    const chains = await repoIntel.getCriticalPaths(repo.id);
    const ranked = await repoIntel.getTopFilesByRank(repo.id, RANKED_FETCH);

    // Existence is checked against the commit the index was built from.
    const tree = await git.listTree(ref, state.lastIndexedSha);
    const regular = tree.filter((e) => REGULAR_FILE_MODES.has(e.mode));
    const exists = new Set(regular.map((e) => e.path));

    const critical = pickCriticalFiles({ chains, ranked, exists });
    const reading = pickReadingPath({ chains, ranked, exists });

    const files = this.promptFileRefs(regular, [...critical.paths, ...reading]);
    const blobs = await git.readBlobs(ref, [...new Set(files.map((f) => f.blob))]);

    const message = buildTourUserMessage({
      repoFullName: repo.fullName,
      fileCount: state.filesIndexed,
      criticalFiles: critical.paths,
      readingFiles: reading,
      outline: outlineDirs(tree),
      files: renderPromptFiles({ files, blobs }),
    });

    const { provider, model } = await resolveFeatureModel(this.container, workspaceId, 'onboarding');
    const llm = await this.container.llm(provider);
    // Exactly one call: no reprompt on invalid output (AC-4).
    const result = await llm.completeStructured({
      model,
      schema: TourGenerationSchema,
      schemaName: TOUR_SCHEMA_NAME,
      temperature: 0,
      maxRetries: 0,
      timeoutMs: this.timeoutMs,
      messages: [
        { role: 'system', content: ONBOARDING_TOUR_SYSTEM_PROMPT },
        { role: 'user', content: message },
      ],
    });

    return {
      content: groundTour({ generation: result.data, critical, reading, exists }),
      state,
    };
  }

  /** Context files first, then code excerpts of the chosen files; secrets never. */
  private promptFileRefs(regular: GitTreeEntry[], chosen: string[]): PromptFileRef[] {
    const context = pickContextFiles(regular);
    const byPath = new Map(regular.map((e) => [e.path, e]));
    const seen = new Set(context.map((f) => f.path));
    const code: PromptFileRef[] = [];
    for (const path of chosen) {
      const entry = byPath.get(path);
      if (!entry || seen.has(path) || isSecretPath(path)) continue;
      seen.add(path);
      code.push({ path, blob: entry.blob, kind: 'code' });
    }
    return [...context, ...code];
  }
}
