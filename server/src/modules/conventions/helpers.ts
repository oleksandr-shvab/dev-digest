import type { ConventionCandidate, ConventionPatch, ConventionStatus } from '@devdigest/shared';
import type { ConventionRow } from './repository.js';

/**
 * Pure helpers for the conventions module — row ⇄ DTO mapping, rule
 * normalisation/dedupe, and the PATCH decision (does this edit the row and
 * does it flip `edited`). No I/O.
 */

/** Map a persisted row to the public `ConventionCandidate` DTO. */
export function toConventionDto(row: ConventionRow): ConventionCandidate {
  return {
    id: row.id,
    // `repo_id` is nullable in the schema, but the module always sets it (spec).
    repo_id: row.repoId ?? '',
    category: row.category,
    rule: row.rule,
    evidence_path: row.evidencePath ?? '',
    evidence_line: row.evidenceLine ?? 0,
    evidence_snippet: row.evidenceSnippet ?? '',
    confidence: row.confidence ?? 0,
    status: row.status,
    edited: row.edited,
    created_at: row.createdAt.toISOString(),
  };
}

/** Lowercase, collapsed whitespace, no trailing punctuation — for dedupe comparisons. */
export function normalizeRule(rule: string): string {
  return rule.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[.!]+$/, '');
}

/**
 * A newly proposed rule against the repo's already-kept rows (Decision 8: a
 * rescan never re-proposes what was already decided). `undefined` means it's
 * new.
 */
export function findDuplicateReason(
  rule: string,
  kept: { rule: string; status: ConventionStatus }[],
): 'duplicate' | 'rejected_before' | undefined {
  const norm = normalizeRule(rule);
  const match = kept.find((k) => normalizeRule(k.rule) === norm);
  if (!match) return undefined;
  return match.status === 'rejected' ? 'rejected_before' : 'duplicate';
}

export interface ConventionPatchPlan {
  set: Partial<Pick<ConventionRow, 'status' | 'rule' | 'category' | 'edited'>>;
  changed: boolean;
}

/**
 * Decide what a PATCH does (Decision 9): editing `rule`/`category` flips
 * `edited` to true (once — it never resets); changing `status` alone does not.
 */
export function planConventionPatch(
  existing: Pick<ConventionRow, 'rule' | 'category' | 'status' | 'edited'>,
  patch: ConventionPatch,
): ConventionPatchPlan {
  const set: ConventionPatchPlan['set'] = {};
  if (patch.status !== undefined && patch.status !== existing.status) set.status = patch.status;

  let contentChanged = false;
  if (patch.rule !== undefined && patch.rule !== existing.rule) {
    set.rule = patch.rule;
    contentChanged = true;
  }
  if (patch.category !== undefined && patch.category !== existing.category) {
    set.category = patch.category;
    contentChanged = true;
  }
  if (contentChanged && !existing.edited) set.edited = true;

  return { set, changed: Object.keys(set).length > 0 };
}
