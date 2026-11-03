import { describe, it, expect } from 'vitest';
import {
  isTourCandidatePath,
  pickCriticalFiles,
  pickReadingPath,
} from '../src/modules/onboarding/selection.js';
import { groundTour, normalizeRepoPath } from '../src/modules/onboarding/grounding.js';
import type { TourGeneration } from '../src/modules/onboarding/prompt.js';

describe('isTourCandidatePath', () => {
  it.each([
    'src/a.test.ts',
    'test/x.ts',
    'vitest.config.ts',
    'package.json',
    'db/migrations/0001.sql',
    'dist/index.js',
    'src/api.generated.ts',
    'types/x.d.ts',
  ])('rejects %s', (path) => {
    expect(isTourCandidatePath(path)).toBe(false);
  });

  it('accepts a plain source file', () => {
    expect(isTourCandidatePath('src/server.ts')).toBe(true);
  });
});

const all = (...paths: string[]) => new Set(paths);

describe('pickCriticalFiles', () => {
  it('keeps only chain files, in rank order, dropping excluded and absent paths', () => {
    const exists = all('src/a.ts', 'src/b.ts', 'src/c.ts', 'src/a.test.ts', 'vitest.config.ts');
    const result = pickCriticalFiles({
      chains: [
        ['src/c.ts', 'src/a.test.ts', 'src/ghost.ts'],
        ['src/a.ts', 'src/b.ts', 'vitest.config.ts', 'src/c.ts'],
      ],
      ranked: ['src/b.ts', 'src/a.ts', 'src/unrelated.ts'],
      exists,
    });
    expect(result).toEqual({ source: 'critical_paths', paths: ['src/b.ts', 'src/a.ts', 'src/c.ts'] });
  });

  it('puts unranked chain files last, in first-seen order', () => {
    const result = pickCriticalFiles({
      chains: [['src/x.ts', 'src/y.ts', 'src/z.ts']],
      ranked: ['src/z.ts'],
      exists: all('src/x.ts', 'src/y.ts', 'src/z.ts'),
    });
    expect(result.paths).toEqual(['src/z.ts', 'src/x.ts', 'src/y.ts']);
  });

  it('caps at 8', () => {
    const paths = Array.from({ length: 12 }, (_, i) => `src/f${i}.ts`);
    const result = pickCriticalFiles({ chains: [paths], ranked: paths, exists: new Set(paths) });
    expect(result.paths).toHaveLength(8);
    expect(result.paths[0]).toBe('src/f0.ts');
  });

  it('falls back to the ranked files when there are no chains', () => {
    const result = pickCriticalFiles({
      chains: [],
      ranked: ['src/a.ts', 'src/a.test.ts', 'src/b.ts'],
      exists: all('src/a.ts', 'src/a.test.ts', 'src/b.ts'),
    });
    expect(result).toEqual({ source: 'file_rank', paths: ['src/a.ts', 'src/b.ts'] });
  });

  it('falls back to file_rank when every chain file is filtered out', () => {
    const result = pickCriticalFiles({
      chains: [['src/a.test.ts', 'src/ghost.ts']],
      ranked: ['src/b.ts'],
      exists: all('src/a.test.ts', 'src/b.ts'),
    });
    expect(result).toEqual({ source: 'file_rank', paths: ['src/b.ts'] });
  });
});

describe('pickReadingPath', () => {
  it('keeps chain order root -> import, then fills from the ranked files', () => {
    const exists = all('src/root.ts', 'src/dep.ts', 'src/leaf.ts', 'src/other.ts', 'src/top.ts');
    const result = pickReadingPath({
      chains: [
        ['src/root.ts', 'src/dep.ts'],
        ['src/other.ts', 'src/dep.ts', 'src/leaf.ts'],
      ],
      ranked: ['src/top.ts', 'src/root.ts'],
      exists,
    });
    expect(result).toEqual([
      'src/root.ts',
      'src/dep.ts',
      'src/other.ts',
      'src/leaf.ts',
      'src/top.ts',
    ]);
  });

  it('caps at 6 and drops excluded files', () => {
    const paths = Array.from({ length: 9 }, (_, i) => `src/f${i}.ts`);
    const result = pickReadingPath({
      chains: [['src/f0.test.ts', ...paths]],
      ranked: [],
      exists: new Set(['src/f0.test.ts', ...paths]),
    });
    expect(result).toEqual(paths.slice(0, 6));
  });
});

describe('normalizeRepoPath', () => {
  it('strips a leading ./ or /', () => {
    expect(normalizeRepoPath('./src/a.ts')).toBe('src/a.ts');
    expect(normalizeRepoPath('/src/a.ts')).toBe('src/a.ts');
    expect(normalizeRepoPath('src/a.ts')).toBe('src/a.ts');
  });
});

describe('groundTour', () => {
  const exists = all('src/server.ts', 'src/auth.ts', 'src/db.ts', 'src/extra.ts');
  const base: TourGeneration = {
    architecture: {
      summary_md: '  The `src/server.ts` boots the app.  ',
      diagram: 'flowchart LR\n  A["client"] --> B["server"]',
      links: [
        { label: 'Server', path: './src/server.ts' },
        { label: 'Nope', path: 'src/nope.ts' },
      ],
    },
    critical_notes: [
      { path: './src/server.ts', note: '  Boots   the\napp  ' },
      { path: 'src/unchosen.ts', note: 'should be ignored' },
    ],
    reading_reasons: [{ path: 'src/server.ts', reason: 'Start here' }],
    run_steps: [
      { command: '  pnpm install  ' },
      { command: 'echo a\necho b' },
      { command: '   ' },
      { command: 'pnpm dev # http://localhost:3000' },
    ],
    first_tasks: [
      { title: 'Ghost task', description: 'd', paths: ['src/ghost.ts'] },
      { title: 'Real task', description: 'two files', paths: ['src/server.ts', './src/auth.ts'] },
      { title: 'Mixed task', description: 'd', paths: ['src/server.ts', 'src/ghost.ts'] },
    ],
  };
  const input = {
    generation: base,
    critical: { source: 'critical_paths' as const, paths: ['src/server.ts', 'src/auth.ts'] },
    reading: ['src/server.ts', 'src/db.ts'],
    exists,
  };

  it('drops a task naming an absent path and keeps one naming two real paths', () => {
    const tour = groundTour(input);
    expect(tour.first_tasks).toEqual([
      { title: 'Real task', description: 'two files', paths: ['src/server.ts', 'src/auth.ts'] },
    ]);
  });

  it('drops a link to an absent path and normalizes the kept one', () => {
    expect(groundTour(input).architecture.links).toEqual([{ label: 'Server', path: 'src/server.ts' }]);
  });

  it('drops a multi-line or empty command and trims the rest', () => {
    expect(groundTour(input).run_steps).toEqual([
      { command: 'pnpm install' },
      { command: 'pnpm dev # http://localhost:3000' },
    ]);
  });

  it('gives an unchosen path no row, and a missing note or reason becomes null', () => {
    const tour = groundTour(input);
    expect(tour.critical_paths).toEqual({
      source: 'critical_paths',
      items: [
        { path: 'src/server.ts', note: 'Boots the app' },
        { path: 'src/auth.ts', note: null },
      ],
    });
    expect(tour.reading_path).toEqual([
      { path: 'src/server.ts', reason: 'Start here' },
      { path: 'src/db.ts', reason: null },
    ]);
  });

  it('trims the summary and keeps a clean diagram', () => {
    const tour = groundTour(input);
    expect(tour.architecture.summary_md).toBe('The `src/server.ts` boots the app.');
    expect(tour.architecture.diagram).toBe('flowchart LR\n  A["client"] --> B["server"]');
  });

  it('turns an empty or fence-only diagram into null and strips fences', () => {
    const withDiagram = (diagram: string | null) =>
      groundTour({ ...input, generation: { ...base, architecture: { ...base.architecture, diagram } } })
        .architecture.diagram;
    expect(withDiagram('')).toBeNull();
    expect(withDiagram('```mermaid\n```')).toBeNull();
    expect(withDiagram(null)).toBeNull();
    expect(withDiagram('```mermaid\nflowchart TD\n  A --> B\n```')).toBe('flowchart TD\n  A --> B');
  });

  it('caps tasks, commands and links', () => {
    const generation: TourGeneration = {
      ...base,
      architecture: {
        ...base.architecture,
        links: Array.from({ length: 12 }, (_, i) => ({ label: `L${i}`, path: 'src/server.ts' })),
      },
      run_steps: Array.from({ length: 12 }, (_, i) => ({ command: `cmd ${i}` })),
      first_tasks: Array.from({ length: 9 }, (_, i) => ({
        title: `T${i}`,
        description: 'd',
        paths: ['src/server.ts'],
      })),
    };
    const tour = groundTour({ ...input, generation });
    expect(tour.architecture.links).toHaveLength(8);
    expect(tour.run_steps).toHaveLength(8);
    expect(tour.first_tasks).toHaveLength(5);
  });
});
