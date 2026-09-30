import { describe, it, expect } from 'vitest';
import { buildSamples, findConfigPaths, renderSample, type RepoFileSystem } from '../src/modules/conventions/sampling.js';
import { MAX_SAMPLE_CHARS, MAX_SAMPLE_LINES } from '../src/modules/conventions/constants.js';

/** A tiny in-memory `RepoFileSystem` for pure tests — no real disk I/O. */
function fakeFs(tree: Record<string, string>): RepoFileSystem {
  const dirs = new Map<string, Set<string>>();
  const addDir = (dir: string) => {
    if (!dirs.has(dir)) dirs.set(dir, new Set());
    return dirs.get(dir)!;
  };
  for (const path of Object.keys(tree)) {
    const parts = path.split('/');
    for (let i = 0; i < parts.length; i++) {
      const dir = parts.slice(0, i).join('/');
      addDir(dir).add(parts[i]!);
    }
  }
  return {
    async listDir(dir: string) {
      const names = dirs.get(dir);
      if (!names) return [];
      return [...names].map((name) => {
        const full = dir ? `${dir}/${name}` : name;
        return { name, isDirectory: dirs.has(full) };
      });
    },
    async readFile(path: string) {
      return path in tree ? tree[path]! : null;
    },
  };
}

describe('findConfigPaths', () => {
  it('finds configs at the root and one level of subdirectories', async () => {
    const fs = fakeFs({
      '.eslintrc.json': '{}',
      'tsconfig.json': '{}',
      'server/tsconfig.json': '{}',
      'server/eslint.config.js': '',
      'client/.prettierrc': '',
      'README.md': '# hi',
    });
    const paths = await findConfigPaths(fs);
    expect(paths.sort()).toEqual(
      ['.eslintrc.json', 'client/.prettierrc', 'server/eslint.config.js', 'server/tsconfig.json', 'tsconfig.json'].sort(),
    );
  });

  it('never descends into node_modules or a second level of subdirectories', async () => {
    const fs = fakeFs({
      'node_modules/some-pkg/tsconfig.json': '{}',
      'server/src/deep/tsconfig.json': '{}',
    });
    expect(await findConfigPaths(fs)).toEqual([]);
  });
});

describe('renderSample', () => {
  it('numbers lines from 1 and prefixes with the path header', () => {
    expect(renderSample('a.ts', 'one\ntwo')).toBe('### a.ts\n   1 | one\n   2 | two');
  });

  it('caps at MAX_SAMPLE_LINES lines', () => {
    const content = Array.from({ length: MAX_SAMPLE_LINES + 50 }, (_, i) => `line ${i}`).join('\n');
    const rendered = renderSample('big.ts', content);
    expect(rendered.split('\n')).toHaveLength(MAX_SAMPLE_LINES + 1); // +1 for the header
  });

  it('caps the numbered body at MAX_SAMPLE_CHARS chars', () => {
    const rendered = renderSample('big.ts', 'x'.repeat(MAX_SAMPLE_CHARS * 2));
    expect(rendered.length).toBeLessThanOrEqual(MAX_SAMPLE_CHARS + '### big.ts\n'.length);
    expect(rendered.length).toBeGreaterThan(MAX_SAMPLE_CHARS);
  });
});

describe('buildSamples', () => {
  it('reads configs + code paths, dedupes, and skips unreadable files', async () => {
    const fs = fakeFs({ 'a.ts': 'const a = 1;', 'b.ts': 'const b = 2;' });
    const samples = await buildSamples(fs, ['a.ts'], ['a.ts', 'b.ts', 'missing.ts']);
    expect(samples.map((s) => s.path)).toEqual(['a.ts', 'b.ts']);
    expect(samples[0]!.rendered).toContain('const a = 1;');
  });
});
