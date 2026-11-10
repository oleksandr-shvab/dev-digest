import type { BriefOmittedInput } from '@devdigest/shared';
import type { BriefFacts } from './facts.js';
import type { BriefMessage } from './prompt.js';

/**
 * Fits the brief input into the token budget, trimming in a fixed order and
 * recording what was left out (AC-14, AC-15). Pure: the caller supplies the
 * message builder and the token counter.
 */

/** The facts cannot fit even after every stage; the model is never called. */
export class BriefBudgetError extends Error {
  constructor() {
    super('Brief input exceeds the token budget');
    this.name = 'BriefBudgetError';
  }
}

export interface FitInput {
  facts: BriefFacts;
  build: (facts: BriefFacts) => BriefMessage[];
  /** Total tokens over ALL messages (system + user). */
  count: (messages: BriefMessage[]) => number;
  budget: number;
}

export interface FitResult {
  facts: BriefFacts;
  messages: BriefMessage[];
  omitted: BriefOmittedInput[];
}

type ListKey = 'callers' | 'findings' | 'files';

export function fitToBudget({ facts, build, count, budget }: FitInput): FitResult {
  let current = facts;
  let messages = build(current);
  const omitted: BriefOmittedInput[] = [];
  const over = () => count(messages) > budget;
  const apply = (next: BriefFacts) => {
    current = next;
    messages = build(current);
  };

  // 1. Specs, last-attached first.
  while (over() && current.specs.length > 0) {
    const dropped = current.specs[current.specs.length - 1]!;
    omitted.push({ kind: 'spec', ref: dropped.path, kept: null, total: null });
    apply({ ...current, specs: current.specs.slice(0, -1) });
  }

  // 2. Issue bodies (titles stay).
  if (over()) {
    const withBody = current.issues.filter((i) => i.body !== null);
    if (withBody.length > 0) {
      omitted.push({
        kind: 'issue_text',
        ref: withBody.map((i) => i.ref).join(', '),
        kept: null,
        total: null,
      });
      apply({ ...current, issues: current.issues.map((i) => ({ ...i, body: null })) });
    }
  }

  // 3. PR description.
  if (over() && current.pr.description !== null) {
    omitted.push({ kind: 'pr_description', ref: null, kept: null, total: null });
    apply({ ...current, pr: { ...current.pr, description: null } });
  }

  // 4-6. Lists, halved until they fit; the leading (top) entries stay.
  const lists: { key: ListKey; kind: 'caller_files' | 'findings' | 'file_stats' }[] = [
    { key: 'callers', kind: 'caller_files' },
    { key: 'findings', kind: 'findings' },
    { key: 'files', kind: 'file_stats' },
  ];
  for (const { key, kind } of lists) {
    if (!over()) break;
    const total = listOf(current, key).length;
    let kept = total;
    while (over() && kept > 1) {
      kept = Math.max(1, Math.floor(kept / 2));
      apply(withList(current, key, kept));
    }
    if (kept < total) omitted.push({ kind, ref: null, kept, total });
  }

  if (over()) throw new BriefBudgetError();
  return { facts: current, messages, omitted };
}

function listOf(facts: BriefFacts, key: ListKey): unknown[] {
  return key === 'callers' ? (facts.blast?.callers ?? []) : facts[key];
}

function withList(facts: BriefFacts, key: ListKey, keep: number): BriefFacts {
  if (key === 'callers') {
    return facts.blast
      ? { ...facts, blast: { ...facts.blast, callers: facts.blast.callers.slice(0, keep) } }
      : facts;
  }
  return { ...facts, [key]: facts[key].slice(0, keep) };
}
