import type { IntentConfidence, IntentSource } from '@devdigest/shared';

/**
 * How much the derived intent can be trusted, as a function of what the
 * classifier was able to read. A fixed rule, not a model opinion:
 *  - a fetched issue or document and nothing missing → high;
 *  - a fetched issue or document, something else missing → medium;
 *  - only the description, nothing missing → medium;
 *  - otherwise (title and file names alone, or missing description) → low.
 */
export function intentConfidence(sources: IntentSource[]): IntentConfidence {
  const usedContext = sources.some(
    (s) => (s.kind === 'issue' || s.kind === 'document') && s.status === 'used',
  );
  const anyUnavailable = sources.some((s) => s.status === 'unavailable');
  const descriptionUsed = sources.some((s) => s.kind === 'pr_description' && s.status === 'used');

  if (usedContext && !anyUnavailable) return 'high';
  if (usedContext) return 'medium';
  if (descriptionUsed && !anyUnavailable) return 'medium';
  return 'low';
}
