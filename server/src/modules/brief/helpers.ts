import { ZodError } from 'zod';
import { PrBrief, type PrBriefState } from '@devdigest/shared';
import { ConfigError } from '../../platform/errors.js';
import type { PinoLike } from '../../platform/run-logger.js';
import { TimeoutError } from '../../platform/resilience.js';
import { BriefBudgetError } from './budget.js';
import type { GenerationSnapshot } from './registry.js';
import type { BriefRow } from './repository.js';

/** The request logger the service needs. */
export type BriefLogger = PinoLike;

const REASON_MAX_CHARS = 200;

/** The one-line reason the page shows after a failed generation (AC-12). */
export function failureReason(err: unknown): string {
  if (err instanceof TimeoutError) return 'timed out';
  if (err instanceof ConfigError) return err.message;
  if (err instanceof BriefBudgetError) return 'input exceeds the 8,000-token budget';
  const message = err instanceof Error ? err.message : String(err);
  if (err instanceof ZodError || /schema validation/i.test(message)) {
    return 'output failed validation';
  }
  return `provider error: ${message}`.slice(0, REASON_MAX_CHARS);
}

/**
 * The stored row plus the live generation status as the API state. A row with
 * a null `head_sha` (legacy) or unreadable JSON reads as no brief.
 */
export function toBriefState({
  prId,
  row,
  headSha,
  snapshot,
}: {
  prId: string;
  row: BriefRow | undefined;
  headSha: string;
  snapshot: GenerationSnapshot;
}): PrBriefState {
  const parsed = row && row.headSha !== null ? PrBrief.safeParse(row.json) : null;
  const live = { generating: snapshot.generating, last_error: snapshot.lastError };

  if (!row || !parsed || !parsed.success) {
    return {
      pr_id: prId,
      brief: null,
      head_sha: null,
      generated_at: null,
      stale: false,
      provider: null,
      model: null,
      tokens_in: null,
      tokens_out: null,
      cost_usd: null,
      unavailable_inputs: [],
      omitted_inputs: [],
      ...live,
    };
  }

  return {
    pr_id: prId,
    brief: parsed.data,
    head_sha: row.headSha,
    generated_at: row.generatedAt ? row.generatedAt.toISOString() : null,
    stale: row.headSha !== headSha,
    provider: row.provider,
    model: row.model,
    tokens_in: row.tokensIn,
    tokens_out: row.tokensOut,
    cost_usd: row.costUsd,
    unavailable_inputs: row.unavailableInputs ?? [],
    omitted_inputs: row.omittedInputs ?? [],
    ...live,
  };
}
