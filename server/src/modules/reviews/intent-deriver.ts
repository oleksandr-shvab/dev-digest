import { randomUUID } from 'node:crypto';
import type { Container } from '../../platform/container.js';
import { Intent as IntentSchema } from '@devdigest/shared';
import type { Intent, RunEventKind, UnifiedDiff } from '@devdigest/shared';
import { buildIntentPrompt, clampIntent, intentConfidence } from '@devdigest/reviewer-core';
import { AppError, ExternalServiceError } from '../../platform/errors.js';
import type { PinoLike } from '../../platform/run-logger.js';
import * as schema from '../../db/schema.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import type { PrIntentRow, PullRow, ReviewRepository } from './repository.js';
import { collectIntentSources } from './intent-sources.js';
import { emitPromptLog, intentSections } from './prompt-log.js';
import { INTENT_MAX_OUTPUT_TOKENS, INTENT_SCHEMA_NAME } from './constants.js';

/**
 * Derives a PR's intent with one cheap classifier call and stores it.
 *
 * Reached ONLY from `POST /pulls/:id/intent` and from the pre-work of a review
 * run — never from PR import, polling or opening the PR page. Logs carry names,
 * references, statuses, sizes and counts: never a source body, the description,
 * the title text, a diff line or a secret.
 */

/** Where derivation progress goes: the run's Live Log, or stdout for the standalone route. */
export type IntentLog = (kind: RunEventKind, msg: string, data?: unknown) => void;

/** An `IntentLog` that mirrors to the request logger (kind `error` → error, else info). */
export function requestIntentLog(
  logger: PinoLike | undefined,
  ctx: Record<string, unknown>,
): IntentLog {
  return (kind, msg, data) => {
    const level = kind === 'error' ? 'error' : 'info';
    logger?.[level]({ ...ctx, kind, ...(data !== undefined ? { data } : {}) }, msg);
  };
}

export class IntentDeriver {
  constructor(
    private container: Container,
    private repo: ReviewRepository,
  ) {}

  async derive(args: {
    workspaceId: string;
    pull: PullRow;
    repoRow: typeof schema.repos.$inferSelect;
    diff: UnifiedDiff;
    log: IntentLog;
  }): Promise<PrIntentRow> {
    const { workspaceId, pull, repoRow, diff, log } = args;

    const { provider, model } = await resolveFeatureModel(this.container, workspaceId, 'review_intent');
    // Resolved before any fetch: a missing provider key fails here (ConfigError).
    const llm = await this.container.llm(provider);
    // One id per derivation; the prompt-assembly line below carries the same one.
    const correlationId = randomUUID();
    log('info', `Intent: deriving with ${provider}/${model}`, { correlationId });

    const { materials, sources } = await collectIntentSources(
      { github: () => this.container.github() },
      { pull, repo: { owner: repoRow.owner, name: repoRow.name }, diff },
    );
    for (const s of sources) {
      log('info', `Intent source: ${s.kind} ${s.ref} — ${s.status}${s.detail ? ` (${s.detail})` : ''}`);
    }

    const confidence = intentConfidence(sources);
    const { messages, components } = buildIntentPrompt(materials);
    const tokenEstimate = messages.reduce((n, m) => n + this.container.tokenizer.count(m.content), 0);
    // Sizes only: `components` carry names and character counts, never the text.
    emitPromptLog(
      { event: (msg, data) => log('info', msg, data), local: (msg, data) => log('info', msg, data) },
      this.container.config.promptLogDetail,
      { feature: 'intent', correlationId, provider, model, label: 'Intent prompt' },
      {
        scope: '',
        sections: intentSections(components),
        totalChars: components.reduce((n, c) => n + c.chars, 0),
        totalTokens: tokenEstimate,
      },
    );

    log('tool', 'Intent: calling classifier…');
    let result;
    try {
      result = await llm.completeStructured<Intent>({
        model,
        schema: IntentSchema,
        schemaName: INTENT_SCHEMA_NAME,
        temperature: 0,
        maxTokens: INTENT_MAX_OUTPUT_TOKENS,
        messages,
      });
    } catch (err) {
      // OpenRouter's provider throws a plain Error; the others throw AppErrors.
      if (err instanceof AppError) throw err;
      throw new ExternalServiceError(`Intent classifier call failed: ${(err as Error).message}`);
    }

    const intent = clampIntent(result.data);
    const row = await this.repo.upsertIntent(pull.id, {
      ...intent,
      confidence,
      sources,
      provider,
      model,
      headSha: pull.headSha,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      costUsd: result.costUsd,
    });

    const cost = result.costUsd == null ? 'cost unknown' : `$${result.costUsd.toFixed(6)}`;
    log(
      'result',
      `Intent derived — confidence ${confidence} · ${intent.in_scope.length} in scope · ${intent.out_of_scope.length} out of scope · ${result.tokensIn} in / ${result.tokensOut} out tokens · ${cost}`,
      { correlationId },
    );
    return row;
  }
}
