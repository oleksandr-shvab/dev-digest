import { describe, it, expect, vi } from 'vitest';
import type { GitClient, RepoRef } from '@devdigest/shared';
import { Container } from '../src/platform/container.js';
import { loadConfig } from '../src/platform/config.js';
import { MockGitClient } from '../src/adapters/mocks.js';
import type { Tokenizer } from '../src/adapters/tokenizer/index.js';

const repo: RepoRef = { owner: 'acme', name: 'payments-api' };
const HEAD = 'c0ffee00c0ffee00c0ffee00c0ffee00c0ffee00';

/** 1 token per character: sizes in tests are exact. */
function charTokenizer(): Tokenizer & { count: ReturnType<typeof vi.fn> } {
  return { count: vi.fn((text: string) => text.length) };
}

function containerFor(
  git: GitClient,
  env: Record<string, string> = {},
  tokenizer: Tokenizer = charTokenizer(),
) {
  return new Container(loadConfig({ NODE_ENV: 'test', ...env }), {} as never, { git, tokenizer });
}

describe('ProjectContextService.collectForRun', () => {
  it('marks missing, symlink and non-UTF-8 paths missing and includes the others', async () => {
    const git = new MockGitClient({
      head: HEAD,
      files: {
        'specs/ok.md': '# ok',
        'docs/bin.md': Buffer.from([0xff, 0xfe, 0x41]),
        'docs/two.md': '# two',
      },
      symlinks: ['specs/evil.md'],
    });
    const out = await containerFor(git).projectContext.collectForRun({
      repo,
      paths: ['specs/ok.md', 'specs/gone.md', 'specs/evil.md', 'docs/bin.md', 'docs/two.md'],
    });
    expect(out.docs.map((d) => [d.path, d.status])).toEqual([
      ['specs/ok.md', 'included'],
      ['specs/gone.md', 'missing'],
      ['specs/evil.md', 'missing'],
      ['docs/bin.md', 'missing'],
      ['docs/two.md', 'included'],
    ]);
    expect(out.docs[0]).toMatchObject({ tokens: 4, text: '# ok' });
    expect(out.docs[1]!.text).toBeUndefined();
  });

  it('skips a whole doc over the budget and still includes a later smaller one', async () => {
    const git = new MockGitClient({
      head: HEAD,
      files: { 'specs/a.md': 'a'.repeat(30), 'specs/b.md': 'b'.repeat(50), 'specs/c.md': 'c'.repeat(10) },
    });
    const out = await containerFor(git, { PROJECT_CONTEXT_BUDGET_TOKENS: '45' }).projectContext.collectForRun({
      repo,
      paths: ['specs/a.md', 'specs/b.md', 'specs/c.md'],
    });
    expect(out.docs.map((d) => d.status)).toEqual(['included', 'skipped_budget', 'included']);
    expect(out.docs[1]!.text).toBeUndefined();
  });

  it('reads the tree and the blobs at the head sha and returns that sha (one commit)', async () => {
    const git = new MockGitClient({ head: HEAD, files: { 'specs/a.md': '# a' } });
    const listTree = vi.spyOn(git, 'listTree');
    const currentHead = vi.spyOn(git, 'currentHead');
    const readBlobs = vi.spyOn(git, 'readBlobs');
    const out = await containerFor(git).projectContext.collectForRun({ repo, paths: ['specs/a.md'] });
    expect(out.commit).toBe(HEAD);
    expect(currentHead).toHaveBeenCalledTimes(1);
    expect(listTree).toHaveBeenCalledTimes(1);
    expect(listTree.mock.calls[0]![1]).toBe(HEAD);
    expect(readBlobs).toHaveBeenCalledTimes(1);
  });

  it('returns every path missing with a null commit when the mirror cannot be read', async () => {
    const git = new MockGitClient({ head: HEAD });
    vi.spyOn(git, 'listTree').mockRejectedValue(new Error('no clone'));
    const out = await containerFor(git).projectContext.collectForRun({ repo, paths: ['specs/a.md', 'docs/b.md'] });
    expect(out.commit).toBeNull();
    expect(out.docs.map((d) => d.status)).toEqual(['missing', 'missing']);
  });

  it('returns nothing for no paths without touching git', async () => {
    const git = new MockGitClient({ head: HEAD });
    const listTree = vi.spyOn(git, 'listTree');
    expect(await containerFor(git).projectContext.collectForRun({ repo, paths: [] })).toEqual({
      commit: null,
      docs: [],
    });
    expect(listTree).not.toHaveBeenCalled();
  });

  it('does not re-count tokens for an unchanged blob', async () => {
    const git = new MockGitClient({ head: HEAD, files: { 'specs/a.md': '# a' } });
    const tokenizer = charTokenizer();
    const c = containerFor(git, {}, tokenizer);
    await c.projectContext.collectForRun({ repo, paths: ['specs/a.md'] });
    await c.projectContext.collectForRun({ repo, paths: ['specs/a.md'] });
    expect(tokenizer.count).toHaveBeenCalledTimes(1);
  });
});
