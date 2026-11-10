import { describe, expect, it } from 'vitest';
import { groundBrief } from '../src/modules/brief/grounding.js';
import type { BriefGeneration } from '../src/modules/brief/prompt.js';

const firstLines = new Map<string, number | null>([
  ['src/a.ts', 10],
  ['src/b.ts', null],
]);
const blastFiles = new Set(['src/caller.ts']);
const givenLines = new Map<string, [number, number][]>([['src/a.ts', [[20, 25]]]]);

const risk = (over: Partial<BriefGeneration['risks'][number]> = {}): BriefGeneration['risks'][number] => ({
  kind: 'k',
  title: 't',
  explanation: 'e',
  severity: 'high',
  files: ['src/a.ts'],
  ...over,
});

function ground(generation: Partial<BriefGeneration>) {
  return groundBrief({
    generation: { summary: 's', risks: [], review_focus: [], ...generation },
    firstLines,
    blastFiles,
    givenLines,
  });
}

describe('groundBrief', () => {
  it('drops an invented path from risks and focus, and a risk left with no file (AC-7)', () => {
    const brief = ground({
      risks: [
        risk({ files: ['src/ghost.ts', 'src/a.ts'] }),
        risk({ title: 'only ghost', files: ['src/ghost.ts'] }),
      ],
      review_focus: [
        { file: 'src/ghost.ts', line: 1, reason: 'x' },
        { file: 'src/a.ts', line: null, reason: 'y' },
      ],
    });
    expect(brief.risks).toHaveLength(1);
    expect(brief.risks[0]?.file_refs).toEqual(['src/a.ts']);
    expect(brief.review_focus.map((f) => f.file)).toEqual(['src/a.ts']);
  });

  it('normalises ./ and leading / and dedupes file refs', () => {
    const brief = ground({ risks: [risk({ files: ['./src/a.ts', ' /src/a.ts', 'src/a.ts'] })] });
    expect(brief.risks[0]?.file_refs).toEqual(['src/a.ts']);
  });

  it('keeps a cited line inside a finding range, else falls back to the first changed line (AC-17)', () => {
    const brief = ground({
      review_focus: [
        { file: 'src/a.ts', line: 22, reason: 'in range' },
        { file: 'src/a.ts', line: 99, reason: 'out of range' },
        { file: 'src/a.ts', line: null, reason: 'no line' },
      ],
    });
    expect(brief.review_focus.map((f) => f.line)).toEqual([22, 10, 10]);
  });

  it('gives line null for a changed file without a first line (AC-18)', () => {
    const brief = ground({ review_focus: [{ file: 'src/b.ts', line: 5, reason: 'r' }] });
    expect(brief.review_focus[0]?.line).toBeNull();
  });

  it('gives line null for a blast-only file, which is still a valid path', () => {
    const brief = ground({
      risks: [risk({ files: ['src/caller.ts'] })],
      review_focus: [{ file: 'src/caller.ts', line: 3, reason: 'r' }],
    });
    expect(brief.risks[0]?.file_refs).toEqual(['src/caller.ts']);
    expect(brief.review_focus[0]).toEqual({ file: 'src/caller.ts', line: null, reason: 'r' });
  });

  it('caps at 6 risks and 5 focus items in model order, after dropping invalid ones (AC-39)', () => {
    const risks = [
      risk({ title: 'bad-1', files: ['nope.ts'] }),
      ...Array.from({ length: 8 }, (_, i) => risk({ title: `r${i}` })),
    ];
    const focus = [
      { file: 'nope.ts', line: null, reason: 'bad' },
      ...Array.from({ length: 7 }, (_, i) => ({ file: 'src/a.ts', line: null, reason: `f${i}` })),
    ];
    const brief = ground({ risks, review_focus: focus });
    expect(brief.risks.map((r) => r.title)).toEqual(['r0', 'r1', 'r2', 'r3', 'r4', 'r5']);
    expect(brief.review_focus.map((f) => f.reason)).toEqual(['f0', 'f1', 'f2', 'f3', 'f4']);
  });

  it('caps text lengths', () => {
    const brief = ground({
      summary: 's'.repeat(2000),
      risks: [risk({ title: 't'.repeat(500), explanation: 'e'.repeat(2000) })],
      review_focus: [{ file: 'src/a.ts', line: null, reason: 'r'.repeat(500) }],
    });
    expect(brief.summary).toHaveLength(1200);
    expect(brief.risks[0]?.title).toHaveLength(120);
    expect(brief.risks[0]?.explanation).toHaveLength(600);
    expect(brief.review_focus[0]?.reason).toHaveLength(200);
  });
});
