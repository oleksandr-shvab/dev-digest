/**
 * Citation grounding — the anti-hallucination gate. A finding is kept only
 * if it cites a location that's actually part of the diff; everything else
 * is a model hallucination and must be dropped before it reaches the user.
 * This was previously untested at the reviewer-core level (server has its
 * own separate `platform/grounding.ts` with coverage, but that's a
 * different implementation from this package's `src/grounding.ts`, which is
 * what `reviewPullRequest()` actually gates on).
 */
import { describe, it, expect } from 'vitest';
import type { Finding, UnifiedDiff } from '@devdigest/shared';
import { buildLineIndex, groundFindings, groundingSummary } from '../src/grounding.js';

function finding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: overrides.id ?? 'f-1',
    severity: 'WARNING',
    category: 'bug',
    title: 'Test finding',
    file: 'src/a.ts',
    start_line: 1,
    end_line: 1,
    rationale: 'r',
    confidence: 0.9,
    kind: 'finding',
    ...overrides,
  };
}

const DIFF: UnifiedDiff = {
  raw: '',
  files: [
    {
      path: 'src/a.ts',
      additions: 2,
      deletions: 0,
      hunks: [
        { file: 'src/a.ts', oldStart: 10, oldLines: 0, newStart: 10, newLines: 2, newLineNumbers: [10, 11] },
        { file: 'src/a.ts', oldStart: 50, oldLines: 0, newStart: 50, newLines: 1, newLineNumbers: [50] },
      ],
    },
  ],
};

describe('groundFindings', () => {
  it('keeps a finding whose range intersects a real hunk', () => {
    const { kept, dropped } = groundFindings([finding({ start_line: 10, end_line: 10 })], DIFF);
    expect(kept).toHaveLength(1);
    expect(dropped).toHaveLength(0);
  });

  it('keeps a finding intersecting the SECOND hunk of a multi-hunk file', () => {
    const { kept, dropped } = groundFindings([finding({ start_line: 50, end_line: 50 })], DIFF);
    expect(kept).toHaveLength(1);
    expect(dropped).toHaveLength(0);
  });

  it('drops a finding whose line range does not intersect any hunk', () => {
    const { kept, dropped } = groundFindings([finding({ start_line: 999, end_line: 999 })], DIFF);
    expect(kept).toHaveLength(0);
    expect(dropped).toHaveLength(1);
    expect(dropped[0]!.reason).toMatch(/do not intersect any diff hunk/);
  });

  it('drops a finding for a file not present in the diff', () => {
    const { kept, dropped } = groundFindings([finding({ file: 'src/nonexistent.ts' })], DIFF);
    expect(kept).toHaveLength(0);
    expect(dropped).toHaveLength(1);
    expect(dropped[0]!.reason).toMatch(/not present in diff/);
  });

  describe('FULL_FILE_KINDS exemption', () => {
    for (const kind of ['secret_leak', 'lethal_trifecta', 'phantom', 'hook'] as const) {
      it(`keeps a '${kind}' finding regardless of line range, as long as the file is in the diff`, () => {
        const { kept, dropped } = groundFindings(
          [finding({ kind, start_line: 99_999, end_line: 99_999 })],
          DIFF,
        );
        expect(kept).toHaveLength(1);
        expect(dropped).toHaveLength(0);
      });
    }

    it('still drops a full-file-kind finding when the file itself is not in the diff', () => {
      // The exemption is "skip line-range checking", not "skip every check" —
      // a finding for a file that was never touched must still be dropped.
      const { kept, dropped } = groundFindings(
        [finding({ kind: 'secret_leak', file: 'src/untouched.ts' })],
        DIFF,
      );
      expect(kept).toHaveLength(0);
      expect(dropped).toHaveLength(1);
      expect(dropped[0]!.reason).toMatch(/not present in diff/);
    });

    it('does NOT exempt a plain "finding"-kind (or missing kind) from line-range checking', () => {
      const withKind = groundFindings(
        [finding({ kind: 'finding', start_line: 999, end_line: 999 })],
        DIFF,
      );
      expect(withKind.kept).toHaveLength(0);

      const noKind = groundFindings(
        [finding({ kind: undefined, start_line: 999, end_line: 999 })],
        DIFF,
      );
      expect(noKind.kept).toHaveLength(0);
    });
  });
});

describe('buildLineIndex', () => {
  it('uses newLineNumbers when present', () => {
    const idx = buildLineIndex(DIFF);
    expect([...idx.get('src/a.ts')!].sort((a, b) => a - b)).toEqual([10, 11, 50]);
  });

  it('falls back to the hunk\'s declared new range when newLineNumbers is empty', () => {
    const diff: UnifiedDiff = {
      raw: '',
      files: [
        {
          path: 'src/b.ts',
          additions: 3,
          deletions: 0,
          hunks: [{ file: 'src/b.ts', oldStart: 5, oldLines: 0, newStart: 5, newLines: 3, newLineNumbers: [] }],
        },
      ],
    };
    const idx = buildLineIndex(diff);
    expect([...idx.get('src/b.ts')!].sort((a, b) => a - b)).toEqual([5, 6, 7]);
  });
});

describe('groundingSummary', () => {
  it('formats kept/total', () => {
    const result = groundFindings(
      [finding({ start_line: 10, end_line: 10 }), finding({ id: 'f-2', start_line: 999, end_line: 999 })],
      DIFF,
    );
    expect(groundingSummary(result)).toBe('1/2 passed');
  });
});
