import { describe, expect, it } from 'vitest';
import type { BlastDegradedReason, BlastRadius } from '@devdigest/shared';
import {
  blastFiles,
  firstChangedLine,
  givenLineRanges,
  toBlastFact,
  toFileFacts,
  toFindingFacts,
  toIntentFact,
} from '../src/modules/brief/facts.js';

describe('firstChangedLine', () => {
  it('returns 1 for a new file', () => {
    expect(firstChangedLine('@@ -0,0 +1,3 @@\n+a\n+b\n+c')).toBe(1);
  });

  it('skips context lines before the first added line', () => {
    const patch = '@@ -9,3 +9,6 @@\n ctx1\n ctx2\n ctx3\n+added12\n+added13';
    expect(firstChangedLine(patch)).toBe(12);
  });

  it('does not count a deletion before the first added line', () => {
    expect(firstChangedLine('@@ -5,3 +5,3 @@\n ctx\n-old\n+new\n ctx')).toBe(6);
  });

  it('returns the new-side start of the first hunk for a deletion-only patch', () => {
    expect(firstChangedLine('@@ -20,3 +18,1 @@\n ctx\n-gone\n-gone2')).toBe(18);
  });

  it('takes the first added line of a later hunk when the first hunk only deletes', () => {
    const patch = '@@ -3,2 +3,1 @@\n ctx\n-gone\n@@ -20,1 +19,2 @@\n ctx\n+added';
    expect(firstChangedLine(patch)).toBe(20);
  });

  it('does not let a "\\ No newline at end of file" marker shift the numbering', () => {
    const patch = '@@ -1,3 +1,3 @@\n a\n-b\n\\ No newline at end of file\n+c\n\\ No newline at end of file';
    expect(firstChangedLine(patch)).toBe(2);
  });

  it('has no changed line to cite for a deleted file (AC-17, AC-18)', () => {
    // A removed file has no new side: line 0 is not a line a reviewer can open.
    expect(firstChangedLine('@@ -1,3 +0,0 @@\n-a\n-b\n-c')).toBeNull();
  });

  it('returns null without a patch', () => {
    expect(firstChangedLine(null)).toBeNull();
    expect(firstChangedLine(undefined)).toBeNull();
    expect(firstChangedLine('')).toBeNull();
  });
});

describe('toFileFacts', () => {
  it('drops the patch and sorts by churn, then path', () => {
    const facts = toFileFacts([
      { path: 'src/b.ts', additions: 1, deletions: 1, patch: 'SENTINEL' },
      { path: 'src/a.ts', additions: 1, deletions: 1, patch: 'SENTINEL' },
      { path: 'src/big.ts', additions: 50, deletions: 5, patch: 'SENTINEL' },
    ]);
    expect(facts.map((f) => f.path)).toEqual(['src/big.ts', 'src/a.ts', 'src/b.ts']);
    expect(JSON.stringify(facts)).not.toContain('SENTINEL');
    expect(facts[0]).toEqual({ path: 'src/big.ts', role: expect.any(String), additions: 50, deletions: 5 });
  });
});

describe('toIntentFact', () => {
  it('is null without a row and caps long text', () => {
    expect(toIntentFact(undefined)).toBeNull();
    const fact = toIntentFact({
      intent: 'x'.repeat(900),
      inScope: Array.from({ length: 15 }, () => 'y'.repeat(300)),
      outOfScope: [],
      confidence: 'low',
    });
    expect(fact?.statement.length).toBe(500);
    expect(fact?.inScope).toHaveLength(10);
    expect(fact?.inScope[0]?.length).toBe(200);
  });
});

function blast(reason?: BlastDegradedReason): BlastRadius {
  return {
    changed_symbols: [{ name: 'f', file: 'src/a.ts', kind: 'function' }],
    downstream: [
      {
        symbol: 'f',
        callers: [
          { name: 'g', file: 'src/b.ts', line: 3 },
          { name: 'h', file: 'src/c.ts', line: 9 },
        ],
        endpoints_affected: ['GET /x'],
        crons_affected: [],
      },
    ],
    summary: 'symbols: 1',
    degraded: reason !== undefined,
    ...(reason ? { reason } : {}),
  };
}

describe('toBlastFact', () => {
  it.each(['flag_off', 'index_failed', 'repo_too_large', 'no_data'] as const)(
    'is null for %s',
    (reason) => {
      expect(toBlastFact(blast(reason))).toBeNull();
    },
  );

  it('keeps an index_partial blast and flattens callers in rank order', () => {
    const fact = toBlastFact(blast('index_partial'));
    expect(fact).toEqual({
      summary: 'symbols: 1',
      endpoints: 1,
      crons: 0,
      callers: [
        { file: 'src/b.ts', line: 3, symbol: 'g' },
        { file: 'src/c.ts', line: 9, symbol: 'h' },
      ],
    });
  });

  it('blastFiles covers changed symbols and callers', () => {
    expect([...blastFiles(blast())].sort()).toEqual(['src/a.ts', 'src/b.ts', 'src/c.ts']);
  });
});

describe('toFindingFacts', () => {
  const row = (over: Partial<Parameters<typeof toFindingFacts>[0][number]>) => ({
    file: 'src/a.ts',
    startLine: 1,
    endLine: 2,
    severity: 'WARNING',
    title: 't',
    dismissedAt: null,
    ...over,
  });

  it('drops dismissed findings and orders CRITICAL before WARNING', () => {
    const facts = toFindingFacts([
      row({ severity: 'WARNING', file: 'src/a.ts' }),
      row({ severity: 'CRITICAL', file: 'src/z.ts' }),
      row({ severity: 'CRITICAL', file: 'src/y.ts', dismissedAt: new Date() }),
    ]);
    expect(facts.map((f) => [f.severity, f.file])).toEqual([
      ['CRITICAL', 'src/z.ts'],
      ['WARNING', 'src/a.ts'],
    ]);
  });

  it('givenLineRanges groups ranges per file', () => {
    const ranges = givenLineRanges(toFindingFacts([row({}), row({ startLine: 10, endLine: 12 })]));
    expect(ranges.get('src/a.ts')).toEqual([
      [1, 2],
      [10, 12],
    ]);
  });
});
