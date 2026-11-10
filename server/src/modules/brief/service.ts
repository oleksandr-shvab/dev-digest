import type {
  BriefOmittedInput,
  BriefUnavailableInput,
  PrBrief,
  PrBriefState,
  RepoRef,
} from '@devdigest/shared';
import { parsePrReferences } from '@devdigest/reviewer-core';
import type { Container } from '../../platform/container.js';
import {
  AppError,
  ConflictError,
  ExternalServiceError,
  NotFoundError,
} from '../../platform/errors.js';
import { withTimeout } from '../../platform/resilience.js';
import { BlastService } from '../blast/service.js';
import { fetchLinkedIssues } from '../reviews/intent-sources.js';
import { pickLatestReviewPerAgent } from '../reviews/smart-diff/build.js';
import type { PullRow } from '../reviews/repository.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { fitToBudget } from './budget.js';
import {
  BRIEF_MAX_OUTPUT_TOKENS,
  BRIEF_SCHEMA_NAME,
  BRIEF_TOKEN_BUDGET,
  GENERATION_TIMEOUT_MS,
  ISSUE_BODY_MAX_CHARS,
  TITLE_MAX_CHARS,
} from './constants.js';
import {
  blastFiles,
  capText,
  firstChangedLine,
  givenLineRanges,
  toBlastFact,
  toFileFacts,
  toFindingFacts,
  toIntentFact,
  type BriefFacts,
} from './facts.js';
import { groundBrief } from './grounding.js';
import { failureReason, toBriefState, type BriefLogger } from './helpers.js';
import { BriefGenerationSchema, buildBriefMessages } from './prompt.js';
import { BriefGenerationRegistry } from './registry.js';
import { BriefRepository } from './repository.js';

/**
 * PR brief service (plans/pr-brief.md). Reads the stored brief and the
 * generation state without any LLM call; generates on an explicit request
 * only, with exactly one structured completion over precomputed facts, under
 * a deadline. It never runs a review, derives an intent or builds an index.
 */

interface BuiltBrief {
  brief: PrBrief;
  provider: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number | null;
  unavailable: BriefUnavailableInput[];
  omitted: BriefOmittedInput[];
}

export class BriefService {
  private repo: BriefRepository;
  private registry = new BriefGenerationRegistry();
  private timeoutMs: number;

  constructor(
    private container: Container,
    opts: { timeoutMs?: number } = {},
  ) {
    this.repo = new BriefRepository(container.db);
    this.timeoutMs = opts.timeoutMs ?? GENERATION_TIMEOUT_MS;
  }

  /** Stored brief + generation status. Never resolves an LLM provider (AC-9). */
  async getState(workspaceId: string, prId: string): Promise<PrBriefState> {
    const pull = await this.pullOf(workspaceId, prId);
    return this.stateFor(pull);
  }

  /**
   * Starts a generation and returns at once with `generating: true`. The
   * check-and-set below has no `await` between `tryStart` and the conflict
   * decision, so two parallel requests cannot both start (AC-23).
   */
  async startGeneration(
    workspaceId: string,
    prId: string,
    log: BriefLogger,
  ): Promise<PrBriefState> {
    const pull = await this.pullOf(workspaceId, prId);

    const files = await this.container.reviewRepo.getPrFiles(prId);
    if (files.length === 0) {
      throw new AppError('no_changed_files', 'This PR has no changed files to brief', 409);
    }

    if (!this.registry.tryStart(prId)) {
      throw new ConflictError('A brief generation is already running for this PR');
    }

    let state: PrBriefState;
    try {
      state = await this.stateFor(pull);
    } catch (err) {
      this.registry.cancel(prId);
      throw err;
    }

    void this.run(workspaceId, pull, log);
    return state;
  }

  private async pullOf(workspaceId: string, prId: string): Promise<PullRow> {
    const pull = await this.container.reviewRepo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    return pull;
  }

  private async stateFor(pull: PullRow): Promise<PrBriefState> {
    return toBriefState({
      prId: pull.id,
      row: await this.repo.get(pull.id),
      headSha: pull.headSha,
      snapshot: this.registry.snapshot(pull.id),
    });
  }

  /** Fire-and-forget body. Never throws: every outcome lands in the registry. */
  private async run(workspaceId: string, pull: PullRow, log: BriefLogger): Promise<void> {
    try {
      // The store happens only after the deadline-guarded build resolves, so a
      // late result is discarded and a failure keeps the previous brief (AC-12).
      const built = await withTimeout(this.build(workspaceId, pull, log), this.timeoutMs);
      await this.repo.upsert({
        prId: pull.id,
        json: built.brief,
        headSha: pull.headSha,
        generatedAt: new Date(),
        provider: built.provider,
        model: built.model,
        tokensIn: built.tokensIn,
        tokensOut: built.tokensOut,
        costUsd: built.costUsd,
        unavailableInputs: built.unavailable,
        omittedInputs: built.omitted,
      });
      this.registry.succeed(pull.id);
      log.info(
        {
          prId: pull.id,
          risks: built.brief.risks.length,
          focus: built.brief.review_focus.length,
          omitted: built.omitted.length,
          unavailable: built.unavailable.length,
          tokensIn: built.tokensIn,
          tokensOut: built.tokensOut,
        },
        'PR brief generated',
      );
    } catch (err) {
      const reason = failureReason(err);
      this.registry.fail(pull.id, reason);
      log.warn({ prId: pull.id, reason }, 'PR brief generation failed');
    }
  }

  private async build(
    workspaceId: string,
    pull: PullRow,
    log: BriefLogger,
  ): Promise<BuiltBrief> {
    const { container } = this;
    const repoRow = await container.reviewRepo.getRepo(pull.repoId);
    if (!repoRow) throw new NotFoundError('Repository not found');
    const ref: RepoRef = { owner: repoRow.owner, name: repoRow.name };
    const issueNumbers = parsePrReferences(pull.body ?? '', {
      owner: ref.owner,
      name: ref.name,
      refs: [pull.branch, pull.base],
    }).issues;

    const [files, intentRow, blast, issueResults, specs, reviews] = await Promise.all([
      container.reviewRepo.getPrFiles(pull.id),
      container.reviewRepo.getIntent(pull.id),
      // An unreadable index is an unavailable input, not a failed brief (AC-6).
      new BlastService(container).blastRadius(workspaceId, pull.id, log).catch((err: unknown) => {
        log.warn({ prId: pull.id, err }, 'PR brief: blast radius read failed');
        return null;
      }),
      fetchLinkedIssues({ github: () => container.github() }, { repo: ref, issueNumbers }),
      container.projectContext.collectWorkspaceSpecs(workspaceId, ref),
      container.reviewRepo.reviewsForPull(pull.id),
    ]);

    const blastFact = blast ? toBlastFact(blast) : null;
    const findings = toFindingFacts(
      pickLatestReviewPerAgent(reviews).flatMap((r) => r.findings),
    );

    const unavailable: BriefUnavailableInput[] = [];
    if (!intentRow) unavailable.push({ kind: 'intent', ref: null });
    if (!blastFact) unavailable.push({ kind: 'blast_radius', ref: null });
    if (issueNumbers.length === 0) {
      unavailable.push({ kind: 'linked_issue', ref: null });
    } else {
      for (const r of issueResults) {
        if (r.source.status === 'unavailable') {
          unavailable.push({ kind: 'linked_issue', ref: r.source.ref });
        }
      }
    }
    const usableDocs = specs.docs.filter(
      (d) => d.status === 'included' || d.status === 'skipped_budget',
    );
    if (usableDocs.length === 0) unavailable.push({ kind: 'specs', ref: null });
    for (const d of specs.docs) {
      if (d.status === 'missing') unavailable.push({ kind: 'specs', ref: d.path });
    }

    const omitted: BriefOmittedInput[] = specs.docs
      .filter((d) => d.status === 'skipped_budget')
      .map((d) => ({ kind: 'spec' as const, ref: d.path, kept: null, total: null }));

    const facts: BriefFacts = {
      pr: { title: capText(pull.title, TITLE_MAX_CHARS), description: pull.body ?? null },
      intent: toIntentFact(intentRow),
      blast: blastFact,
      files: toFileFacts(files),
      issues: issueResults.flatMap((r) =>
        r.issue
          ? [
              {
                ref: r.issue.ref,
                title: r.issue.title,
                body: r.issue.body === null ? null : capText(r.issue.body, ISSUE_BODY_MAX_CHARS),
              },
            ]
          : [],
      ),
      specs: specs.docs.flatMap((d) =>
        d.status === 'included' && d.text !== undefined ? [{ path: d.path, text: d.text }] : [],
      ),
      findings,
    };

    const fitted = fitToBudget({
      facts,
      build: buildBriefMessages,
      count: (messages) => messages.reduce((n, m) => n + container.tokenizer.count(m.content), 0),
      budget: BRIEF_TOKEN_BUDGET,
    });

    const { provider, model } = await resolveFeatureModel(container, workspaceId, 'risk_brief');
    const llm = await container.llm(provider);

    // Exactly one call: no reprompt on invalid output (AC-11), and no tools (AC-28).
    let result;
    try {
      result = await llm.completeStructured({
        model,
        schema: BriefGenerationSchema,
        schemaName: BRIEF_SCHEMA_NAME,
        temperature: 0,
        maxRetries: 0,
        maxTokens: BRIEF_MAX_OUTPUT_TOKENS,
        timeoutMs: this.timeoutMs,
        messages: fitted.messages,
      });
    } catch (err) {
      // OpenRouter's provider throws a plain Error; the others throw AppErrors.
      if (err instanceof AppError) throw err;
      throw new ExternalServiceError(`Brief generation call failed: ${(err as Error).message}`);
    }

    const brief = groundBrief({
      generation: result.data,
      firstLines: new Map(files.map((f) => [f.path, firstChangedLine(f.patch)])),
      blastFiles: blast && blastFact ? blastFiles(blast) : new Set<string>(),
      givenLines: givenLineRanges(fitted.facts.findings),
    });

    return {
      brief,
      provider,
      model,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      costUsd: result.costUsd,
      unavailable,
      omitted: [...omitted, ...fitted.omitted],
    };
  }
}
