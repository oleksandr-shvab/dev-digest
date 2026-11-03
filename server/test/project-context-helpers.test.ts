import { describe, it, expect } from 'vitest';
import type { GitTreeEntry } from '@devdigest/shared';
import {
  compileGlobs,
  selectDocs,
  isEligibleEntry,
  docTypeFor,
  decodeUtf8,
  orderAttachedPaths,
  planBudget,
  countUsedBy,
  type CollectedDoc,
} from '../src/modules/project-context/helpers.js';
import { DEFAULT_PROJECT_CONTEXT_GLOB } from '../src/platform/config.js';

const entry = (path: string, mode = '100644'): GitTreeEntry => ({
  path,
  mode,
  blob: 'a'.repeat(40),
  size: 1,
});

describe('selectDocs', () => {
  const tree = [
    'specs/a.md',
    'a/docs/b/c.md',
    'insights/x.md',
    'README.md',
    'docs/a.txt',
    'node_modules/foo/docs/README.md',
    '.git/docs/x.md',
  ].map((p) => entry(p));

  it('picks default-glob docs only, sorted', () => {
    const picked = selectDocs(tree, compileGlobs([DEFAULT_PROJECT_CONTEXT_GLOB])).map((e) => e.path);
    expect(picked).toEqual(['a/docs/b/c.md', 'insights/x.md', 'specs/a.md']);
  });

  it('supports a custom glob list', () => {
    const picked = selectDocs(tree, compileGlobs(['README.md', 'docs/*.txt'])).map((e) => e.path);
    expect(picked).toEqual(['README.md']);
    const both = selectDocs(tree, compileGlobs(['README.md', 'specs/*.md'])).map((e) => e.path);
    expect(both).toEqual(['README.md', 'specs/a.md']);
  });

  it('rejects symlinks and submodules', () => {
    expect(isEligibleEntry(entry('specs/a.md', '120000'))).toBe(false);
    expect(isEligibleEntry(entry('specs/a.md', '160000'))).toBe(false);
    expect(isEligibleEntry(entry('specs/a.md', '100755'))).toBe(true);
  });
});

describe('docTypeFor', () => {
  it('uses the folder nearest the file', () => {
    expect(docTypeFor('specs/docs/a.md')).toBe('docs');
    expect(docTypeFor('docs/specs/a.md')).toBe('specs');
    expect(docTypeFor('insights/x.md')).toBe('insights');
  });
});

describe('decodeUtf8', () => {
  it('returns null for invalid UTF-8 and the text otherwise', () => {
    expect(decodeUtf8(Buffer.from([0xff, 0xfe]))).toBeNull();
    expect(decodeUtf8(Buffer.from('héllo'))).toBe('héllo');
  });
});

describe('orderAttachedPaths', () => {
  it('puts own first, then skills in order, first occurrence wins', () => {
    expect(orderAttachedPaths(['a.md', 'b.md'], [['b.md', 'c.md'], ['a.md', 'd.md']])).toEqual([
      'a.md',
      'b.md',
      'c.md',
      'd.md',
    ]);
  });
});

describe('planBudget', () => {
  const doc = (path: string, tokens: number, status: CollectedDoc['status'] = 'included'): CollectedDoc => ({
    path,
    tokens,
    status,
    text: path,
  });

  it('skips a whole doc that exceeds the rest but includes a later smaller one', () => {
    const out = planBudget([doc('a', 5000), doc('big', 25000), doc('c', 1000)], 20000);
    expect(out.map((d) => d.status)).toEqual(['included', 'skipped_budget', 'included']);
    expect(out[1]!.text).toBeUndefined();
  });

  it('always skips a single doc larger than the budget', () => {
    expect(planBudget([doc('x', 21)], 20)[0]!.status).toBe('skipped_budget');
  });

  it('keeps missing docs missing and free', () => {
    const out = planBudget([doc('m', 0, 'missing'), doc('a', 20)], 20);
    expect(out.map((d) => d.status)).toEqual(['missing', 'included']);
  });
});

describe('countUsedBy', () => {
  it('counts an agent once when it has the path directly and through a skill', () => {
    const counts = countUsedBy(
      [
        { id: 'a1', contextPaths: ['x.md'] },
        { id: 'a2', contextPaths: [] },
      ],
      [
        { agentId: 'a1', contextPaths: ['x.md', 'y.md'] },
        { agentId: 'a2', contextPaths: ['x.md'] },
      ],
    );
    expect(counts.get('x.md')).toBe(2);
    expect(counts.get('y.md')).toBe(1);
    expect(counts.get('z.md')).toBeUndefined();
  });
});
