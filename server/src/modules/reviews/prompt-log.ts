import type { PromptSection } from '@devdigest/reviewer-core';
import type { PromptLogDetail } from '../../platform/config.js';

/**
 * Structured log record for "what went into this prompt".
 *
 * Built ONLY from section names, fixed source labels, sizes, the model and a
 * correlation id. Nothing here takes prompt text, so the diff, a spec or a
 * secret cannot reach a log line through it. Detail mode adds per-item sizes,
 * and those go to stdout only (see `PromptLogSinks.local`).
 */

export interface PromptLogContext {
  feature: 'review' | 'intent';
  /** Review: the agent run id. Intent: one fresh id per derivation. */
  correlationId: string;
  provider: string;
  model: string;
  /** Human label that starts the Live Log line, e.g. 'Prompt assembled'. */
  label: string;
}

export interface PromptLogRecord {
  /** Which call: 'all files' or a file path (map-reduce). Empty when there is one call. */
  scope: string;
  sections: PromptSection[];
  totalChars: number;
  totalTokens?: number;
}

export interface PromptLogSinks {
  /** Live Log + SSE + persisted trace + stdout. Summary only. */
  event: (msg: string, data: Record<string, unknown>) => void;
  /** Stdout only. Receives the per-item detail. */
  local: (msg: string, data: Record<string, unknown>) => void;
}

/** Fixed provenance labels for the intent classifier's prompt components. */
const INTENT_COMPONENT_SOURCES: Record<string, string> = {
  system: 'reviewer-core.intent_system_prompt',
  pr_title: 'pull_requests.title',
  pr_description: 'pull_requests.body',
  issues: 'github.issues',
  documents: 'github.contents',
  missing_context: 'intent-sources.unavailable',
  changed_files: 'diff.outline',
};

/** Turn the classifier's prompt components into log sections (sizes only). */
export function intentSections(components: { name: string; chars: number }[]): PromptSection[] {
  return components.map((c) => ({
    name: c.name,
    source: INTENT_COMPONENT_SOURCES[c.name] ?? 'unknown',
    chars: c.chars,
  }));
}

export function emitPromptLog(
  sinks: PromptLogSinks,
  detail: PromptLogDetail,
  ctx: PromptLogContext,
  record: PromptLogRecord,
): void {
  if (detail === 'off') return;

  const base = {
    event: 'prompt_assembled',
    feature: ctx.feature,
    correlationId: ctx.correlationId,
    provider: ctx.provider,
    model: ctx.model,
    scope: record.scope,
    totalChars: record.totalChars,
    ...(record.totalTokens !== undefined ? { totalTokens: record.totalTokens } : {}),
  };
  const summary = record.sections.map((s) => ({
    name: s.name,
    source: s.source,
    chars: s.chars,
    ...(s.tokens !== undefined ? { tokens: s.tokens } : {}),
  }));
  const msg =
    `${ctx.label}${record.scope ? ` (${record.scope})` : ''}: ` +
    record.sections.map((s) => `${s.name} ${s.chars} chars`).join(' · ') +
    (record.totalTokens !== undefined ? ` · ~${record.totalTokens} tokens (estimate)` : '') +
    ` · ${ctx.provider}/${ctx.model}`;

  sinks.event(msg, { ...base, sections: summary });

  if (detail !== 'full') return;
  const withItems = record.sections.filter((s) => s.items && s.items.length > 0);
  if (withItems.length === 0) return;
  sinks.local(`${ctx.label} detail${record.scope ? ` (${record.scope})` : ''}`, {
    ...base,
    event: 'prompt_assembled_detail',
    items: withItems.map((s) => ({ section: s.name, items: s.items })),
  });
}
