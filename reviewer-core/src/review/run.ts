import type {
  Finding,
  LLMProvider,
  PromptAssembly,
  Review,
  RunEventKind,
  UnifiedDiff,
} from '@devdigest/shared';
import { Review as ReviewSchema } from '@devdigest/shared';
import {
  assemblePrompt,
  type PromptSection,
  type PromptSectionItem,
  type ReviewIntent,
} from '../prompt.js';
import { groundFindings, groundingSummary } from '../grounding.js';
import { dropOutOfScopeFindings } from '../scope.js';
import { reduceReviews, scoreFromFindings, sliceDiff } from './reduce.js';

/**
 * reviewPullRequest — the review engine entry point.
 *
 * given (diff + resolved agent inputs + injected LLM) → grounded Review.
 *
 * This is the pure core lifted out of the server's `ReviewService.runOneAgent`:
 * assemble prompt → single-pass OR map-reduce per file → reduce → SHARED
 * citation-grounding gate. It performs NO I/O beyond the injected LLM provider
 * (no DB, GitHub, fs, memory retrieval, intent, or persistence) — those stay in
 * the caller (server persists + streams SSE; runner posts + writes an artifact).
 *
 * Skill bodies / memory / specs are RESOLVED strings here: the caller turns
 * AgentManifest skill slugs into bodies (DB in the studio, fs in the runner).
 */

/** Default map-reduce threshold (matches the server's FILE_MAP_THRESHOLD_LINES). */
export const DEFAULT_MAP_THRESHOLD_LINES = 400;
/** Default structured-output reprompt retries (matches REVIEW_MAX_RETRIES). */
export const DEFAULT_REVIEW_MAX_RETRIES = 2;

export type ReviewStrategy = 'auto' | 'single-pass' | 'map-reduce';
export type ReviewMode = 'single-pass' | 'map-reduce';

/** Progress event emitted during a review (server → SSE bus, runner → log). */
export interface ReviewEvent {
  kind: RunEventKind;
  msg: string;
  data?: unknown;
}

/** The size breakdown of one prompt sent to the model (one LLM call). */
export interface PromptAssemblyRecord {
  /** 'all files' in single-pass; the file path in map-reduce. */
  chunk: string;
  mode: ReviewMode;
  sections: PromptSection[];
  /** Sum of the sections' `chars`. */
  totalChars: number;
  /** Sum of the sections' `tokens`; absent when no `countTokens` was given. */
  totalTokens?: number;
}

/**
 * Opt-in prompt-assembly logging. The engine reports sizes and fixed labels only
 * (see `PromptSection`); the caller adds model, correlation id and where to write.
 */
export interface PromptLogHook {
  /** Per-item sizes inside each section (per skill, per spec chunk, per diff file). */
  detail?: boolean;
  countTokens?: (text: string) => number;
  onAssembled: (record: PromptAssemblyRecord) => void;
}

export interface ReviewInput {
  /** Agent system prompt (trusted). */
  systemPrompt: string;
  /** Model id understood by the injected provider (e.g. 'deepseek/deepseek-v4-flash'). */
  model: string;
  /** The PR's unified diff (already parsed; hunks carry new-side line numbers). */
  diff: UnifiedDiff;
  /** Injected LLM provider (OpenRouter in CI, OpenAI/Anthropic in the studio). */
  llm: LLMProvider;
  /** 'auto' (default) picks single-pass unless the diff is large + multi-file. */
  strategy?: ReviewStrategy;
  /** Resolved skill bodies (NOT slugs). */
  skills?: string[];
  /** Curated memory items. */
  memory?: string[];
  /** Project-context spec chunks (untrusted; delimiter-wrapped downstream). */
  specs?: string[];
  /**
   * Optional callers-of-changed-symbols digest (T1.3). Untrusted; rendered
   * before the diff section. Empty/undefined → section omitted.
   */
  callers?: string;
  /**
   * Optional repo skeleton / map (T3). Untrusted; rendered before the project
   * context section. Empty/undefined → section omitted.
   */
  repoMap?: string;
  /** PR author's description/body (untrusted; truncated + delimiter-wrapped in
      the prompt). Empty/undefined → section omitted. */
  prDescription?: string;
  /**
   * Derived PR intent. When set, it is rendered into the prompt and the scope
   * gate runs after grounding — except for `low` confidence, where the intent
   * is context only and nothing is filtered. Undefined → no section, no gate.
   */
  intent?: ReviewIntent;
  /** Task framing line, e.g. "Review PR #482 …". */
  task?: string;
  /** Override the structured-output retry budget. */
  maxRetries?: number;
  /** Override the map-reduce line threshold. */
  mapThresholdLines?: number;
  /**
   * OpenRouter session id — forwarded on every LLM call so all chunks of this
   * review group into one session in the OpenRouter dashboard.
   */
  sessionId?: string;
  /** Progress sink. */
  onEvent?: (e: ReviewEvent) => void;
  /** When set, called once per LLM call with the prompt's size breakdown. */
  promptLog?: PromptLogHook;
  /**
   * Cancellation checkpoint, called before each (expensive) chunk LLM call.
   * Supply a function that THROWS to abort mid-run (the caller owns the error
   * type, e.g. the server's RunCancelledError); the engine stays agnostic.
   */
  checkCancelled?: () => void;
}

export interface ReviewOutcome {
  /** The reduced, GROUNDED review (findings that survived the citation gate). */
  review: Review;
  /** Human-readable grounding summary, e.g. "3/4 passed". */
  grounding: string;
  /** Findings dropped by grounding, with reasons (for logs / "never go silent"). */
  dropped: { finding: Finding; reason: string }[];
  /** Findings dropped by the scope gate (empty when it did not run), with reasons. */
  scopeDropped: { finding: Finding; reason: string }[];
  /** Which path ran. */
  mode: ReviewMode;
  /** Prompt assembly (for the run trace). Single-pass: the one call; map-reduce: the whole-diff assembly. */
  assembly: PromptAssembly;
  /** Per-chunk labels (for the run trace's tool_calls). */
  chunks: { label: string }[];
  tokensIn: number;
  tokensOut: number;
  costUsd: number | null;
  /** Joined raw model outputs (for the run trace). */
  raw: string;
}

function selectMode(strategy: ReviewStrategy, diff: UnifiedDiff, threshold: number): ReviewMode {
  if (strategy === 'single-pass') return 'single-pass';
  if (strategy === 'map-reduce') return diff.files.length > 1 ? 'map-reduce' : 'single-pass';
  // auto: map-reduce only when the diff is both large AND multi-file (else 1 call).
  const totalLines = diff.files.reduce((n, f) => n + f.additions + f.deletions, 0);
  return totalLines > threshold && diff.files.length > 1 ? 'map-reduce' : 'single-pass';
}

/** Per-file diff sizes for the log's `diff` section. Sizes only; the path is a label. */
function diffItemsFor(
  diff: UnifiedDiff,
  chunk: { label: string; diffText: string },
  mode: ReviewMode,
): PromptSectionItem[] {
  if (mode === 'map-reduce') return [{ label: chunk.label, chars: chunk.diffText.length }];
  return diff.files.map((f) => ({ label: f.path, chars: sliceDiff(diff, f.path).length }));
}

export async function reviewPullRequest(input: ReviewInput): Promise<ReviewOutcome> {
  const threshold = input.mapThresholdLines ?? DEFAULT_MAP_THRESHOLD_LINES;
  const maxRetries = input.maxRetries ?? DEFAULT_REVIEW_MAX_RETRIES;
  const mode = selectMode(input.strategy ?? 'auto', input.diff, threshold);
  const emit = (kind: RunEventKind, msg: string, data?: unknown) =>
    input.onEvent?.({ kind, msg, data });

  const promptParts = {
    system: input.systemPrompt,
    skills: input.skills,
    memory: input.memory,
    specs: input.specs,
    callers: input.callers,
    repoMap: input.repoMap,
    prDescription: input.prDescription,
    intent: input.intent,
    task: input.task,
  };

  // Whole-diff assembly is the trace default; overwritten below for single-pass.
  let assembly: PromptAssembly = assemblePrompt({ ...promptParts, diff: input.diff.raw }).assembly;

  const chunks =
    mode === 'map-reduce'
      ? input.diff.files.map((f) => ({ label: f.path, diffText: sliceDiff(input.diff, f.path) }))
      : [{ label: 'all files', diffText: input.diff.raw }];

  emit(
    'info',
    mode === 'map-reduce'
      ? `Large diff → map-reduce over ${input.diff.files.length} files`
      : `Reviewing ${input.diff.files.length} changed file(s) in one pass`,
  );

  const partials: Review[] = [];
  let tokensIn = 0;
  let tokensOut = 0;
  let costUsd: number | null = 0;
  const raws: string[] = [];

  for (const chunk of chunks) {
    // Cancellation checkpoint — stop before the next (expensive) LLM call.
    input.checkCancelled?.();
    // 'map:' prefix only for the map-reduce path (one call per file). In
    // single-pass there is exactly one chunk (the whole diff) — don't mislabel it.
    emit(
      'tool',
      mode === 'map-reduce' ? `map: reviewing ${chunk.label}` : `Reviewing ${chunk.label} in one pass`,
      { file: chunk.label },
    );
    const a = assemblePrompt(
      { ...promptParts, diff: chunk.diffText },
      input.promptLog && {
        detail: input.promptLog.detail ?? false,
        ...(input.promptLog.countTokens ? { countTokens: input.promptLog.countTokens } : {}),
        ...(input.promptLog.detail
          ? { diffItems: diffItemsFor(input.diff, chunk, mode) }
          : {}),
      },
    );
    if (mode === 'single-pass') assembly = a.assembly;
    if (input.promptLog) {
      const tokens = a.sections.map((s) => s.tokens);
      input.promptLog.onAssembled({
        chunk: chunk.label,
        mode,
        sections: a.sections,
        totalChars: a.sections.reduce((n, s) => n + s.chars, 0),
        ...(tokens.every((t): t is number => t !== undefined)
          ? { totalTokens: tokens.reduce((n, t) => n + t, 0) }
          : {}),
      });
    }
    const res = await input.llm.completeStructured<Review>({
      model: input.model,
      schema: ReviewSchema,
      schemaName: 'Review',
      messages: a.messages,
      maxRetries,
      ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    });
    tokensIn += res.tokensIn;
    tokensOut += res.tokensOut;
    costUsd = costUsd == null || res.costUsd == null ? null : costUsd + res.costUsd;
    raws.push(res.raw);
    partials.push(res.data);
    emit('result', `${chunk.label}: ${res.data.findings.length} candidate finding(s)`);
  }

  const merged = reduceReviews(partials);
  emit(
    'result',
    `Reduced to ${merged.findings.length} finding(s); verdict=${merged.verdict}, score=${merged.score}`,
  );

  // SHARED citation-grounding gate (the only post-step; not duplicated per strategy).
  const ground = groundFindings(merged.findings, input.diff);
  const grounding = groundingSummary(ground);
  for (const d of ground.dropped) {
    emit('info', `grounding dropped "${d.finding.title}": ${d.reason}`);
  }
  emit('result', `Citation grounding: ${grounding}`);

  // Scope gate: only with an intent. A `low`-confidence intent is context for
  // the reviewer, not a filter — it was guessed from too little to hide findings.
  let surviving = ground.kept;
  let scopeDropped: ReviewOutcome['scopeDropped'] = [];
  if (input.intent?.confidence === 'low') {
    emit('info', 'Scope gate skipped — the intent has low confidence');
  } else if (input.intent) {
    const scope = dropOutOfScopeFindings(ground.kept);
    surviving = scope.kept;
    scopeDropped = scope.dropped;
    for (const d of scope.dropped) {
      emit('info', `scope gate dropped "${d.finding.title}": ${d.reason}`);
    }
    for (const f of scope.kept) {
      if (f.scope === 'out_of_scope') {
        emit('info', `scope gate kept out-of-scope CRITICAL "${f.title}"`);
      }
    }
    emit('result', `Scope gate: ${scope.kept.length}/${ground.kept.length} kept`);
  }

  // Score is derived from the findings that SURVIVED grounding and the scope
  // gate (not the model's self-reported number, and not the pre-grounding set)
  // so the score, the findings list, and the deterministic event always agree.
  return {
    review: { ...merged, findings: surviving, score: scoreFromFindings(surviving) },
    grounding,
    dropped: ground.dropped,
    scopeDropped,
    mode,
    assembly,
    chunks: chunks.map((c) => ({ label: c.label })),
    tokensIn,
    tokensOut,
    costUsd,
    raw: raws.join('\n---\n'),
  };
}
