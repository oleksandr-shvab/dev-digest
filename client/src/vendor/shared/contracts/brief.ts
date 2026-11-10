import { z } from 'zod';

/**
 * PR Brief building blocks: Intent, Blast radius, Risks, PR History,
 * Smart Diff. Composed into PrBrief.
 */

// ---- Intent ----
export const Intent = z.object({
  intent: z.string(),
  in_scope: z.array(z.string()),
  out_of_scope: z.array(z.string()),
});
export type Intent = z.infer<typeof Intent>;

/** Where a piece of intent context came from. */
export const IntentSourceKind = z.enum([
  'pr_title',
  'pr_description',
  'issue',
  'document',
  'external_link',
  'changed_files',
]);
export type IntentSourceKind = z.infer<typeof IntentSourceKind>;

export const IntentSourceStatus = z.enum(['used', 'unavailable']);
export type IntentSourceStatus = z.infer<typeof IntentSourceStatus>;

/** One input of the intent classifier, recorded as used or unavailable. */
export const IntentSource = z.object({
  kind: IntentSourceKind,
  ref: z.string(),
  status: IntentSourceStatus,
  detail: z.string().nullish(),
});
export type IntentSource = z.infer<typeof IntentSource>;

export const IntentConfidence = z.enum(['high', 'medium', 'low']);
export type IntentConfidence = z.infer<typeof IntentConfidence>;

// ---- Blast radius ----
export const ChangedSymbol = z.object({
  name: z.string(),
  file: z.string(),
  kind: z.string(),
});
export type ChangedSymbol = z.infer<typeof ChangedSymbol>;

export const BlastCaller = z.object({
  name: z.string(),
  file: z.string(),
  line: z.number().int(),
});
export type BlastCaller = z.infer<typeof BlastCaller>;

export const DownstreamImpact = z.object({
  symbol: z.string(),
  callers: z.array(BlastCaller),
  endpoints_affected: z.array(z.string()),
  crons_affected: z.array(z.string()),
});
export type DownstreamImpact = z.infer<typeof DownstreamImpact>;

// Why a blast radius may be incomplete — the values of repo-intel's DegradedReason (server/src/modules/repo-intel/types.ts).
export const BlastDegradedReason = z.enum(['flag_off', 'index_failed', 'index_partial', 'repo_too_large', 'no_data']);
export type BlastDegradedReason = z.infer<typeof BlastDegradedReason>;

export const BlastRadius = z.object({
  changed_symbols: z.array(ChangedSymbol),
  downstream: z.array(DownstreamImpact),
  summary: z.string(),
  // Set by GET /pulls/:id/blast; absent in a stored PrBrief.
  degraded: z.boolean().optional(),
  reason: BlastDegradedReason.optional(),
});
export type BlastRadius = z.infer<typeof BlastRadius>;

// ---- Risks ----
export const RiskSeverity = z.enum(['high', 'medium', 'low']);
export type RiskSeverity = z.infer<typeof RiskSeverity>;

export const Risk = z.object({
  kind: z.string(),
  title: z.string(),
  explanation: z.string(),
  severity: RiskSeverity,
  file_refs: z.array(z.string()),
});
export type Risk = z.infer<typeof Risk>;

export const Risks = z.object({
  risks: z.array(Risk),
});
export type Risks = z.infer<typeof Risks>;

// ---- PR History ----
export const PrHistoryItem = z.object({
  pr_number: z.number().int(),
  title: z.string(),
  merged_at: z.string(),
  author: z.string(),
  files_overlap: z.array(z.string()),
  notes: z.string(),
});
export type PrHistoryItem = z.infer<typeof PrHistoryItem>;

export const PrHistory = z.object({
  history: z.array(PrHistoryItem),
});
export type PrHistory = z.infer<typeof PrHistory>;

// ---- Smart Diff ----
// Display order of Smart Diff groups.
export const SmartDiffRole = z.enum(['core', 'tests', 'wiring', 'docs', 'boilerplate']);
export type SmartDiffRole = z.infer<typeof SmartDiffRole>;

export const SmartDiffFile = z.object({
  path: z.string(),
  pseudocode_summary: z.string().nullish(),
  additions: z.number().int(),
  deletions: z.number().int(),
  finding_lines: z.array(z.number().int()),
});
export type SmartDiffFile = z.infer<typeof SmartDiffFile>;

export const SmartDiffGroup = z.object({
  role: SmartDiffRole,
  files: z.array(SmartDiffFile),
});
export type SmartDiffGroup = z.infer<typeof SmartDiffGroup>;

export const ProposedSplit = z.object({
  name: z.string(),
  files: z.array(z.string()),
});
export type ProposedSplit = z.infer<typeof ProposedSplit>;

export const SmartDiff = z.object({
  groups: z.array(SmartDiffGroup),
  split_suggestion: z.object({
    too_big: z.boolean(),
    total_lines: z.number().int(),
    proposed_splits: z.array(ProposedSplit),
  }),
});
export type SmartDiff = z.infer<typeof SmartDiff>;

// ---- PR Brief (pr_brief.json) ----
/** One file (and optionally a line) to read first, in reading order. */
export const ReviewFocusItem = z.object({
  file: z.string(),
  line: z.number().int().nullable(),
  reason: z.string(),
});
export type ReviewFocusItem = z.infer<typeof ReviewFocusItem>;

export const PrBrief = z.object({
  summary: z.string(),
  risks: z.array(Risk),
  review_focus: z.array(ReviewFocusItem),
});
export type PrBrief = z.infer<typeof PrBrief>;

/** Inputs a brief can be generated without. */
export const BriefInputKind = z.enum(['intent', 'blast_radius', 'linked_issue', 'specs']);
export type BriefInputKind = z.infer<typeof BriefInputKind>;

export const BriefUnavailableInput = z.object({
  kind: BriefInputKind,
  ref: z.string().nullable(),
});
export type BriefUnavailableInput = z.infer<typeof BriefUnavailableInput>;

/** What the input-budget fitter left out. */
export const BriefOmittedKind = z.enum([
  'spec',
  'issue_text',
  'pr_description',
  'caller_files',
  'findings',
  'file_stats',
]);
export type BriefOmittedKind = z.infer<typeof BriefOmittedKind>;

export const BriefOmittedInput = z.object({
  kind: BriefOmittedKind,
  ref: z.string().nullable(),
  kept: z.number().int().nullable(),
  total: z.number().int().nullable(),
});
export type BriefOmittedInput = z.infer<typeof BriefOmittedInput>;

/** Transport state of GET/POST /pulls/:id/brief. */
export const PrBriefState = z.object({
  pr_id: z.string(),
  brief: PrBrief.nullable(),
  head_sha: z.string().nullable(),
  generated_at: z.string().nullable(),
  stale: z.boolean(),
  provider: z.string().nullable(),
  model: z.string().nullable(),
  tokens_in: z.number().int().nullable(),
  tokens_out: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
  unavailable_inputs: z.array(BriefUnavailableInput),
  omitted_inputs: z.array(BriefOmittedInput),
  generating: z.boolean(),
  last_error: z.string().nullable(),
});
export type PrBriefState = z.infer<typeof PrBriefState>;
