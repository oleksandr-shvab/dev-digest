import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SimpleGitClient } from '../src/adapters/git/simple-git.js';
import { ValidationError } from '../src/platform/errors.js';

const repo = { owner: 'acme', name: 'docs-repo' };
const BIN = Buffer.from([0xff, 0xfe, 0x00, 0x41, 0x80]);

let root: string;
let client: SimpleGitClient;
let head: string;

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 't',
      GIT_AUTHOR_EMAIL: 't@t',
      GIT_COMMITTER_NAME: 't',
      GIT_COMMITTER_EMAIL: 't@t',
    },
  }).trim();
}

function write(dir: string, rel: string, content: string | Buffer): void {
  const full = join(dir, rel);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, content);
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'git-tree-'));
  const dir = join(root, repo.owner, repo.name);
  mkdirSync(dir, { recursive: true });
  git(dir, 'init', '-q', '-b', 'main');
  write(dir, 'specs/a.md', '# A\n');
  write(dir, 'node_modules/x/docs/README.md', '# dep\n');
  write(dir, 'docs/bin.md', BIN);
  symlinkSync('/etc/passwd', join(dir, 'specs/evil.md'));
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'init');
  head = git(dir, 'rev-parse', 'HEAD');
  client = new SimpleGitClient(root);
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('SimpleGitClient.listTree / readBlobs', () => {
  it('lists blobs with modes and flags the symlink as 120000', async () => {
    const tree = await client.listTree(repo, head);
    const byPath = new Map(tree.map((e) => [e.path, e]));
    expect(byPath.get('specs/evil.md')?.mode).toBe('120000');
    expect(byPath.get('specs/a.md')?.mode).toBe('100644');
    expect(byPath.get('specs/a.md')?.size).toBe(4);
    expect(byPath.get('node_modules/x/docs/README.md')?.mode).toBe('100644');
    expect(byPath.get('docs/bin.md')?.mode).toBe('100644');
    expect(tree.every((e) => /^[0-9a-f]{40}$/.test(e.blob))).toBe(true);
  });

  it('returns exact bytes (including non-UTF-8) and null for an unknown sha', async () => {
    const tree = await client.listTree(repo, head);
    const a = tree.find((e) => e.path === 'specs/a.md')!;
    const bin = tree.find((e) => e.path === 'docs/bin.md')!;
    const unknown = 'f'.repeat(40);
    const blobs = await client.readBlobs(repo, [a.blob, bin.blob, unknown]);
    expect(blobs.get(a.blob)?.toString('utf8')).toBe('# A\n');
    expect(blobs.get(bin.blob)?.equals(BIN)).toBe(true);
    expect(blobs.get(unknown)).toBeNull();
  });

  it('rejects a malformed ref or sha', async () => {
    await expect(client.listTree(repo, 'HEAD')).rejects.toBeInstanceOf(ValidationError);
    await expect(client.listTree(repo, '--output=/tmp/x')).rejects.toBeInstanceOf(ValidationError);
    await expect(client.readBlobs(repo, ['abc'])).rejects.toBeInstanceOf(ValidationError);
    await expect(client.readBlobs(repo, ['a'.repeat(40) + '\n' + 'b'.repeat(40)])).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it('reads 1,000 small .md files in under 2,000 ms', async () => {
    const bigRepo = { owner: 'acme', name: 'big-repo' };
    const dir = join(root, bigRepo.owner, bigRepo.name);
    mkdirSync(dir, { recursive: true });
    git(dir, 'init', '-q', '-b', 'main');
    for (let i = 0; i < 1000; i++) write(dir, `docs/d${i}.md`, `# doc ${i}\n`);
    git(dir, 'add', '-A');
    git(dir, 'commit', '-q', '-m', 'many');
    const sha = git(dir, 'rev-parse', 'HEAD');

    const t0 = performance.now();
    const tree = await client.listTree(bigRepo, sha);
    const blobs = await client.readBlobs(
      bigRepo,
      tree.map((e) => e.blob),
    );
    const elapsed = performance.now() - t0;

    expect(tree).toHaveLength(1000);
    expect(blobs.size).toBe(1000);
    expect(elapsed).toBeLessThan(2000);
  });
});
