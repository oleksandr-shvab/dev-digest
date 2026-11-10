import type { BlastDegradedReason } from '@devdigest/shared';

/** Input budget (system + user messages) for the single `risk_brief` call (AC-14). */
export const BRIEF_TOKEN_BUDGET = 8000;

/** Caps applied after grounding (AC-39). */
export const MAX_RISKS = 6;
export const MAX_FOCUS = 5;

export const GENERATION_TIMEOUT_MS = 60_000;
export const BRIEF_MAX_OUTPUT_TOKENS = 1500;
export const BRIEF_SCHEMA_NAME = 'PrBriefGeneration';

/** Per-field caps applied while collecting facts. */
export const TITLE_MAX_CHARS = 300;
export const INTENT_STATEMENT_MAX_CHARS = 500;
export const INTENT_ITEM_MAX_CHARS = 200;
export const INTENT_MAX_ITEMS = 10;
export const ISSUE_BODY_MAX_CHARS = 4000;
export const FINDING_TITLE_MAX_CHARS = 200;

/** Caps applied to the model answer in grounding. */
export const RISK_TITLE_MAX_CHARS = 120;
export const RISK_EXPLANATION_MAX_CHARS = 600;
export const FOCUS_REASON_MAX_CHARS = 200;
export const SUMMARY_MAX_CHARS = 1200;

/** Blast-radius reasons that make the blast input unavailable; `index_partial` does not. */
export const BLAST_UNAVAILABLE_REASONS: ReadonlySet<BlastDegradedReason> = new Set([
  'flag_off',
  'index_failed',
  'repo_too_large',
  'no_data',
]);

/** Lower sorts first. */
export const SEVERITY_RANK: Record<string, number> = {
  CRITICAL: 0,
  WARNING: 1,
  SUGGESTION: 2,
};
export const SEVERITY_RANK_OTHER = 3;
