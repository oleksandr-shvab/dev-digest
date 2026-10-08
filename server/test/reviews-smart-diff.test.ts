/**
 * Smart Diff — the pure path classifier (`modules/reviews/smart-diff/classify.ts`)
 * that groups PR files by role (first matching rule wins, checked in the order
 * boilerplate → tests → wiring → docs; everything else is core), and the pure
 * builders in `build.ts` that turn PR files + findings into a `SmartDiff`.
 */
import { describe, it, expect } from 'vitest';
import type { SmartDiffRole } from '@devdigest/shared';
import { classifyFile } from '../src/modules/reviews/smart-diff/classify.js';
import { buildSmartDiff, pickLatestReviewPerAgent } from '../src/modules/reviews/smart-diff/build.js';

const CASES: ReadonlyArray<readonly [string, SmartDiffRole]> = [
  // Disputed cases — pinned on purpose. If the team decides otherwise, change
  // the rule in smart-diff/constants.ts and the row here together.
  ['src/__tests__/__snapshots__/x.snap', 'boilerplate'],
  ['.claude/skills/security/SKILL.md', 'wiring'],
  ['e2e/README.md', 'tests'],

  // boilerplate
  ['pnpm-lock.yaml', 'boilerplate'],
  ['client/pnpm-lock.yaml', 'boilerplate'],
  ['yarn.lock', 'boilerplate'],
  ['Cargo.lock', 'boilerplate'],
  ['dist/index.js', 'boilerplate'], // boilerplate beats the wiring barrel
  ['src/api.generated.ts', 'boilerplate'],
  ['public/vendor.min.js', 'boilerplate'],

  // tests
  ['server/test/integration.it.test.ts', 'tests'],
  ['client/src/A/A.test.tsx', 'tests'],
  ['src/a.spec.ts', 'tests'],
  ['src/__tests__/a.ts', 'tests'],
  ['e2e/specs/05-pr-diff.flow.json', 'tests'],

  // wiring
  ['server/src/modules/index.ts', 'wiring'],
  ['client/next.config.ts', 'wiring'],
  ['server/tsconfig.json', 'wiring'],
  ['.eslintrc.json', 'wiring'],
  ['.env.example', 'wiring'],
  ['docker-compose.yml', 'wiring'],
  ['.github/workflows/ci.yml', 'wiring'],

  // docs
  ['README.md', 'docs'],
  ['server/specs/smart-diff.md', 'docs'],
  ['docs/agent-prompts/x.txt', 'docs'],
  ['CHANGELOG', 'docs'],
  ['LICENSE', 'docs'],

  // core
  ['src/config.ts', 'core'], // config.ts is not `*.config.*`
  ['src/middleware/ratelimit.ts', 'core'],
  ['server/src/modules/reviews/service.ts', 'core'],
];

describe('classifyFile', () => {
  it.each(CASES)('%s → %s', (path, role) => {
    expect(classifyFile(path)).toBe(role);
  });
});

const file = (path: string, additions = 1, deletions = 0) => ({ path, additions, deletions });
const finding = (file: string, startLine: number, dismissedAt: Date | null = null) => ({
  file,
  startLine,
  dismissedAt,
});

describe('buildSmartDiff', () => {
  it('returns five groups in display order even with no files', () => {
    const d = buildSmartDiff([], []);
    expect(d.groups.map((g) => g.role)).toEqual(['core', 'tests', 'wiring', 'docs', 'boilerplate']);
    expect(d.groups.every((g) => g.files.length === 0)).toBe(true);
  });

  it('puts a lock file in boilerplate and keeps input order inside a group', () => {
    const d = buildSmartDiff(
      [file('src/b.ts'), file('pnpm-lock.yaml'), file('src/a.ts')],
      [],
    );
    const byRole = Object.fromEntries(d.groups.map((g) => [g.role, g.files.map((f) => f.path)]));
    expect(byRole.boilerplate).toEqual(['pnpm-lock.yaml']);
    expect(byRole.core).toEqual(['src/b.ts', 'src/a.ts']);
  });

  it('finding_lines is sorted and de-duplicated, ignores dismissed findings and other paths', () => {
    const d = buildSmartDiff(
      [file('src/a.ts'), file('src/b.ts'), file('src/c.ts')],
      [
        finding('src/a.ts', 30),
        finding('src/a.ts', 12),
        finding('src/a.ts', 30),
        finding('src/b.ts', 7),
        finding('src/b.ts', 99, new Date()),
        finding('src/elsewhere.ts', 1),
      ],
    );
    const core = d.groups.find((g) => g.role === 'core')!.files;
    expect(core.map((f) => [f.path, f.finding_lines])).toEqual([
      ['src/a.ts', [12, 30]],
      ['src/b.ts', [7]],
      ['src/c.ts', []],
    ]);
    expect(core.filter((f) => f.finding_lines.length > 0)).toHaveLength(2);
  });

  it('total_lines is the sum of additions and deletions; the split suggestion stays minimal', () => {
    const d = buildSmartDiff([file('a.ts', 10, 2), file('README.md', 3, 5)], []);
    expect(d.split_suggestion).toEqual({ too_big: false, total_lines: 20, proposed_splits: [] });
  });
});

describe('pickLatestReviewPerAgent', () => {
  const row = (id: string, kind: string, agentId: string | null) => ({ id, review: { kind, agentId } });

  it('keeps the newest review of each agent', () => {
    const rows = [row('r1', 'review', 'a'), row('r2', 'review', 'b')];
    expect(pickLatestReviewPerAgent(rows).map((r) => r.id)).toEqual(['r1', 'r2']);
  });

  it('keeps only the newest when the same agent reviewed twice', () => {
    const rows = [row('new', 'review', 'a'), row('old', 'review', 'a')];
    expect(pickLatestReviewPerAgent(rows).map((r) => r.id)).toEqual(['new']);
  });

  it('drops summary reviews and collapses null agents into one', () => {
    const rows = [
      row('s', 'summary', 'a'),
      row('n1', 'review', null),
      row('n2', 'review', null),
    ];
    expect(pickLatestReviewPerAgent(rows).map((r) => r.id)).toEqual(['n1']);
  });
});
