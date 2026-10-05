/**
 * Review module constants.
 */

/**
 * Studio review strategy. 'single-pass' = send the WHOLE diff in ONE LLM call.
 * We deliberately do NOT use 'auto'/map-reduce by default: map-reduce makes one
 * call PER FILE, which is slow and fragile (any single file's transient 5xx
 * fails the entire run) and unnecessary — the whole diff already fits the
 * model's context.
 */
export const REVIEW_STRATEGY = 'single-pass' as const;

/** Schema name sent with the intent classifier's structured request. */
export const INTENT_SCHEMA_NAME = 'Intent';

/**
 * Output cap for the intent classifier. The answer needs a few hundred tokens;
 * the rest is headroom for the model's reasoning tokens (the default model is
 * reasoning-capable), so a truncated answer is not the normal case.
 */
export const INTENT_MAX_OUTPUT_TOKENS = 4000;

/** Largest referenced document the classifier will read (bytes, before decoding). */
export const INTENT_MAX_DOCUMENT_BYTES = 200_000;
