import { describe, expect, it } from 'vitest';
import { BriefBudgetError, fitToBudget } from '../src/modules/brief/budget.js';
import type { BriefFacts } from '../src/modules/brief/facts.js';
import { buildBriefMessages, type BriefMessage } from '../src/modules/brief/prompt.js';

// A fake tokenizer: four characters per token over every message.
const count = (msgs: BriefMessage[]) => Math.ceil(msgs.reduce((n, m) => n + m.content.length, 0) / 4);

function base(): BriefFacts {
  return {
    pr: { title: 'T', description: null },
    intent: null,
    blast: null,
    files: [{ path: 'src/a.ts', role: 'core', additions: 1, deletions: 0 }],
    issues: [],
    specs: [],
    findings: [],
  };
}

const baseTokens = count(buildBriefMessages(base()));

function run(facts: BriefFacts, extra: number) {
  return fitToBudget({ facts, build: buildBriefMessages, count, budget: baseTokens + extra });
}

describe('fitToBudget', () => {
  it('returns facts that fit unchanged', () => {
    const facts = { ...base(), specs: [{ path: 'docs/a.md', text: 'short' }] };
    const out = fitToBudget({ facts, build: buildBriefMessages, count, budget: 100_000 });
    expect(out.facts).toEqual(facts);
    expect(out.omitted).toEqual([]);
    expect(out.messages).toEqual(buildBriefMessages(facts));
  });

  it('drops specs last-attached first, before touching issue text', () => {
    const facts: BriefFacts = {
      ...base(),
      issues: [{ ref: 'o/r#1', title: 'it', body: 'b'.repeat(40) }],
      specs: [
        { path: 'docs/one.md', text: 's'.repeat(2000) },
        { path: 'docs/two.md', text: 's'.repeat(2000) },
      ],
    };
    const out = run(facts, 700);
    expect(out.omitted.map((o) => o.kind)).toEqual(['spec']);
    expect(out.omitted[0]?.ref).toBe('docs/two.md');
    expect(out.facts.specs.map((s) => s.path)).toEqual(['docs/one.md']);
    expect(out.facts.issues[0]?.body).toBe('b'.repeat(40));
  });

  it('trims in order: specs, issue text, description, then lists', () => {
    const facts: BriefFacts = {
      ...base(),
      pr: { title: 'T', description: 'd'.repeat(2000) },
      issues: [
        { ref: 'o/r#1', title: 'it', body: 'b'.repeat(2000) },
        { ref: 'o/r#2', title: 'it2', body: 'c'.repeat(2000) },
      ],
      specs: [{ path: 'docs/one.md', text: 's'.repeat(2000) }],
      blast: {
        summary: 's',
        endpoints: 0,
        crons: 0,
        callers: Array.from({ length: 8 }, (_, i) => ({ file: `src/c${i}.ts`, line: i, symbol: 'x'.repeat(100) })),
      },
    };
    const out = run(facts, 200);
    expect(out.omitted.map((o) => o.kind)).toEqual([
      'spec',
      'issue_text',
      'pr_description',
      'caller_files',
    ]);
    expect(out.omitted[1]?.ref).toBe('o/r#1, o/r#2');
    expect(out.facts.issues.map((i) => i.title)).toEqual(['it', 'it2']);
    expect(out.facts.pr.description).toBeNull();
    expect(count(out.messages)).toBeLessThanOrEqual(baseTokens + 200);
  });

  it('reports kept/total for a cut list and keeps the leading entries', () => {
    const callers = Array.from({ length: 16 }, (_, i) => ({ file: `src/c${i}.ts`, line: i, symbol: 'x'.repeat(80) }));
    const facts: BriefFacts = {
      ...base(),
      blast: { summary: 's', endpoints: 0, crons: 0, callers },
    };
    const out = fitToBudget({
      facts,
      build: buildBriefMessages,
      count,
      budget: count(buildBriefMessages(facts)) - 120,
    });
    const entry = out.omitted.find((o) => o.kind === 'caller_files');
    expect(entry).toMatchObject({ ref: null, total: 16 });
    expect(entry!.kept).toBeLessThan(16);
    expect(out.facts.blast!.callers).toEqual(callers.slice(0, entry!.kept!));
  });

  it('cuts findings and then file stats when earlier lists are not enough', () => {
    const facts: BriefFacts = {
      ...base(),
      files: Array.from({ length: 12 }, (_, i) => ({ path: `src/${'p'.repeat(60)}${i}.ts`, role: 'core' as const, additions: 12 - i, deletions: 0 })),
      findings: Array.from({ length: 12 }, (_, i) => ({
        file: `src/f${i}.ts`,
        startLine: 1,
        endLine: 2,
        severity: 'WARNING',
        title: 't'.repeat(60),
      })),
    };
    const floor = count(
      buildBriefMessages({ ...facts, findings: facts.findings.slice(0, 1), files: facts.files.slice(0, 1) }),
    );
    const out = fitToBudget({ facts, build: buildBriefMessages, count, budget: floor });
    expect(out.omitted).toEqual([
      { kind: 'findings', ref: null, kept: 1, total: 12 },
      { kind: 'file_stats', ref: null, kept: 1, total: 12 },
    ]);
    expect(out.facts.files[0]?.path).toBe(facts.files[0]?.path);
    expect(count(out.messages)).toBeLessThanOrEqual(floor);
  });

  it('throws BriefBudgetError when nothing more can be trimmed', () => {
    expect(() =>
      fitToBudget({ facts: base(), build: buildBriefMessages, count, budget: 10 }),
    ).toThrow(BriefBudgetError);
  });
});
