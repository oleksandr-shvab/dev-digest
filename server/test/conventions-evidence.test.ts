import { describe, it, expect } from 'vitest';
import { createEvidenceChecker } from '../src/modules/conventions/evidence.js';

function fsWith(files: Record<string, string | null>) {
  const reads: string[] = [];
  return {
    reads,
    fs: {
      async readFile(path: string) {
        reads.push(path);
        return path in files ? files[path]! : null;
      },
    },
  };
}

describe('createEvidenceChecker', () => {
  const content = ['import x from "y";', 'export function f() {', '  return doThing();', '}', ''].join('\n');

  it('accepts a snippet on the exact cited line', async () => {
    const { fs } = fsWith({ 'a.ts': content });
    const checker = createEvidenceChecker(new Set(['a.ts']), fs);
    const result = await checker.verify({ path: 'a.ts', line: 3, snippet: 'return doThing();' });
    expect(result).toEqual({ ok: true, line: 3 });
  });

  it('rejects a path never shown to the model', async () => {
    const { fs } = fsWith({ 'a.ts': content });
    const checker = createEvidenceChecker(new Set(['a.ts']), fs);
    expect(await checker.verify({ path: 'b.ts', line: 1, snippet: 'x' })).toEqual({
      ok: false,
      reason: 'path_not_sampled',
    });
  });

  it('rejects a `..` path traversal attempt (never in sampledPaths)', async () => {
    const { fs } = fsWith({ 'a.ts': content });
    const checker = createEvidenceChecker(new Set(['a.ts']), fs);
    expect(await checker.verify({ path: '../../etc/passwd', line: 1, snippet: 'x' })).toEqual({
      ok: false,
      reason: 'path_not_sampled',
    });
  });

  it('finds a snippet within ±3 lines and corrects the reported line', async () => {
    const { fs } = fsWith({ 'a.ts': content });
    const checker = createEvidenceChecker(new Set(['a.ts']), fs);
    // cited line 1, real line 3 — 2 lines off, within the window.
    const result = await checker.verify({ path: 'a.ts', line: 1, snippet: 'return doThing();' });
    expect(result).toEqual({ ok: true, line: 3 });
  });

  it('tolerates whitespace differences between the cited snippet and the line', async () => {
    const { fs } = fsWith({ 'a.ts': content });
    const checker = createEvidenceChecker(new Set(['a.ts']), fs);
    const result = await checker.verify({ path: 'a.ts', line: 3, snippet: '  return   doThing();  ' });
    expect(result).toEqual({ ok: true, line: 3 });
  });

  it('rejects a snippet that is not there', async () => {
    const { fs } = fsWith({ 'a.ts': content });
    const checker = createEvidenceChecker(new Set(['a.ts']), fs);
    expect(await checker.verify({ path: 'a.ts', line: 3, snippet: 'this never appears' })).toEqual({
      ok: false,
      reason: 'snippet_not_found',
    });
  });

  it('reports file_missing when a sampled path can no longer be read', async () => {
    const { fs } = fsWith({}); // 'a.ts' was sampled but readFile now returns null
    const checker = createEvidenceChecker(new Set(['a.ts']), fs);
    expect(await checker.verify({ path: 'a.ts', line: 1, snippet: 'x' })).toEqual({
      ok: false,
      reason: 'file_missing',
    });
  });

  it('caches repeated reads of the same file', async () => {
    const { fs, reads } = fsWith({ 'a.ts': content });
    const checker = createEvidenceChecker(new Set(['a.ts']), fs);
    await checker.verify({ path: 'a.ts', line: 3, snippet: 'return doThing();' });
    await checker.verify({ path: 'a.ts', line: 2, snippet: 'export function f()' });
    expect(reads).toEqual(['a.ts']);
  });
});
