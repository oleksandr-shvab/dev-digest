import { simpleGit, type SimpleGit } from 'simple-git';
import { join } from 'node:path';
import { mkdir, readFile, access, rm } from 'node:fs/promises';
import { constants } from 'node:fs';
import { spawn } from 'node:child_process';
import type {
  GitClient,
  RepoRef,
  CloneOptions,
  UnifiedDiff,
  BlameLine,
  GitCommit,
  GitTreeEntry,
} from '@devdigest/shared';
import { parseUnifiedDiff } from './diff-parser.js';
import { ValidationError } from '../../platform/errors.js';

/**
 * Depth fetched by `sync()`. Deeper than the shallow clone (CLONE_DEPTH=1) so the
 * previously-indexed sha is usually reachable, keeping the resync diff incremental;
 * when it isn't, the indexer falls back to a full reindex.
 */
const RESYNC_FETCH_DEPTH = 50;

/** A full object id; the only shape of ref/sha that reaches a git argument or stdin. */
const FULL_SHA = /^[0-9a-f]{40}$/;
/** `git cat-file --batch` is killed after this long, whatever it is doing. */
const CAT_FILE_TIMEOUT_MS = 15_000;
/** One `git ls-tree -r -l -z` record: `<mode> <type> <sha> <size>\t<path>`. */
const LS_TREE_RECORD = /^(\d+) (\w+) ([0-9a-f]{40}) +(\d+|-)\t([\s\S]+)$/;

/**
 * GitClient over simple-git. Repos clone to
 * `<cloneDir>/<owner>/<repo>`. We NEVER execute repo code — only git ops.
 */
export class SimpleGitClient implements GitClient {
  constructor(private cloneDir: string) {
    // Force non-interactive auth so an unauthenticated/private clone fails in
    // ~1s with a clear error instead of hanging on a credential prompt until the
    // job timeout. Set on process.env (inherited by git subprocesses) rather
    // than via simple-git's .env(), which inspects and rejects vars like
    // PAGER/EDITOR present in the shell environment.
    process.env.GIT_TERMINAL_PROMPT ??= '0';
    process.env.GCM_INTERACTIVE ??= 'never';
  }

  clonePathFor(repo: RepoRef): string {
    return join(this.cloneDir, repo.owner, repo.name);
  }

  private git(repo: RepoRef): SimpleGit {
    return simpleGit(this.clonePathFor(repo));
  }

  private async exists(path: string): Promise<boolean> {
    try {
      await access(path, constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  async clone(repo: RepoRef, url: string, opts?: CloneOptions): Promise<{ path: string }> {
    const dest = this.clonePathFor(repo);
    await mkdir(join(this.cloneDir, repo.owner), { recursive: true });
    if (await this.exists(join(dest, '.git'))) {
      // already cloned → fetch latest
      await simpleGit(dest).fetch();
      return { path: dest };
    }
    // A prior clone may have timed out mid-write, leaving a partial dir without
    // a .git — git clone refuses a non-empty dest, so clear it first.
    if (await this.exists(dest)) await rm(dest, { recursive: true, force: true });
    const args: string[] = [];
    if (opts?.depth) args.push('--depth', String(opts.depth));
    if (opts?.branch) args.push('--branch', opts.branch);
    await simpleGit(this.cloneDir).clone(url, dest, args);
    return { path: dest };
  }

  async fetchPullHead(repo: RepoRef, n: number): Promise<void> {
    // Fetch the PR head ref into a local ref (GitHub exposes pull/<n>/head).
    await this.git(repo).fetch(['origin', `pull/${n}/head:pr-${n}`]);
  }

  async sync(repo: RepoRef, branch: string): Promise<{ head: string }> {
    // Resync the read-only mirror to upstream. A bare `fetch` only moves
    // `origin/<branch>`, so we `reset --hard` to advance local HEAD + worktree —
    // safe here because we never commit to or run code from the clone.
    // Fetch a bounded depth (> the shallow CLONE_DEPTH) so the prior indexed sha
    // is usually reachable for an incremental diff; the indexer falls back to a
    // full reindex when it isn't.
    const g = this.git(repo);
    await g.fetch(['origin', branch, '--depth', String(RESYNC_FETCH_DEPTH)]);
    await g.reset(['--hard', `origin/${branch}`]);
    return { head: (await g.revparse(['HEAD'])).trim() };
  }

  async currentHead(repo: RepoRef): Promise<string> {
    return (await this.git(repo).revparse(['HEAD'])).trim();
  }

  async diff(repo: RepoRef, base: string, head: string): Promise<UnifiedDiff> {
    const raw = await this.git(repo).diff([`${base}...${head}`]);
    return parseUnifiedDiff(raw);
  }

  /**
   * `git diff --name-only base..head` — used by the incremental indexer to
   * pick the file set that changed since `last_indexed_sha`. Two-dot is
   * intentional (commits reachable from `head` but not `base`), unlike the
   * three-dot symmetric form `diff()` uses for review diffs.
   */
  async diffNameOnly(repo: RepoRef, base: string, head: string): Promise<string[]> {
    if (base === head) return [];
    const raw = await this.git(repo).raw(['diff', '--name-only', `${base}..${head}`]);
    return raw
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  async blame(repo: RepoRef, path: string): Promise<BlameLine[]> {
    const raw = await this.git(repo).raw(['blame', '--line-porcelain', path]);
    return parseBlamePorcelain(raw);
  }

  async log(repo: RepoRef, path?: string): Promise<GitCommit[]> {
    const log = await this.git(repo).log(path ? { file: path } : undefined);
    return log.all.map((c) => ({
      sha: c.hash,
      message: c.message,
      author: c.author_name,
      date: c.date,
    }));
  }

  async readFile(repo: RepoRef, path: string): Promise<string> {
    return readFile(join(this.clonePathFor(repo), path), 'utf8');
  }

  /**
   * Blob entries of the tree at `ref`, straight from git objects (no worktree
   * walk). `ref` must be a full sha. Submodule (`commit`) entries are dropped;
   * the mode is kept so a caller can reject symlinks (`120000`).
   */
  async listTree(repo: RepoRef, ref: string): Promise<GitTreeEntry[]> {
    if (!FULL_SHA.test(ref)) throw new ValidationError('ref must be a full 40-hex commit sha');
    const raw = await this.git(repo).raw(['ls-tree', '-r', '-l', '-z', ref]);
    const out: GitTreeEntry[] = [];
    for (const record of raw.split('\0')) {
      if (record.length === 0) continue;
      const m = LS_TREE_RECORD.exec(record);
      if (!m || m[2] !== 'blob') continue;
      out.push({ mode: m[1]!, blob: m[3]!, size: Number(m[4]), path: m[5]! });
    }
    return out;
  }

  /**
   * Exact bytes of many blobs through one `git cat-file --batch` process
   * (simple-git cannot feed stdin). Every sha is validated before it is written.
   */
  async readBlobs(repo: RepoRef, blobs: string[]): Promise<Map<string, Buffer | null>> {
    for (const sha of blobs) {
      if (!FULL_SHA.test(sha)) throw new ValidationError('blob id must be a 40-hex sha');
    }
    const result = new Map<string, Buffer | null>();
    if (blobs.length === 0) return result;
    const unique = [...new Set(blobs)];

    const stdout = await new Promise<Buffer>((resolve, reject) => {
      const child = spawn('git', ['cat-file', '--batch'], {
        cwd: this.clonePathFor(repo),
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      const chunks: Buffer[] = [];
      let stderr = '';
      let settled = false;
      const settle = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        fn();
      };
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        settle(() => reject(new Error('git cat-file timed out')));
      }, CAT_FILE_TIMEOUT_MS);
      child.stdout.on('data', (c: Buffer) => chunks.push(c));
      child.stderr.on('data', (c: Buffer) => (stderr += c.toString('utf8')));
      child.on('error', (e) => settle(() => reject(e)));
      child.on('close', (code) =>
        settle(() =>
          code === 0
            ? resolve(Buffer.concat(chunks))
            : reject(new Error(`git cat-file exited with ${code}: ${stderr.trim()}`)),
        ),
      );
      // EPIPE when git dies early surfaces through 'close'/'error' above.
      child.stdin.on('error', () => {});
      child.stdin.end(unique.map((sha) => `${sha}\n`).join(''));
    });

    // Frames: `<sha> blob <size>\n<bytes>\n` or `<sha> missing\n`, in request order.
    let pos = 0;
    for (const sha of unique) {
      const nl = stdout.indexOf(0x0a, pos);
      if (nl === -1) throw new Error('git cat-file: truncated output');
      const header = stdout.toString('utf8', pos, nl).split(' ');
      pos = nl + 1;
      if (header[1] === 'missing') {
        result.set(sha, null);
        continue;
      }
      const size = Number(header[2]);
      if (header[1] !== 'blob' || !Number.isInteger(size) || pos + size > stdout.length) {
        throw new Error('git cat-file: unexpected output');
      }
      result.set(sha, Buffer.from(stdout.subarray(pos, pos + size)));
      pos += size + 1;
    }
    return result;
  }
}

function parseBlamePorcelain(raw: string): BlameLine[] {
  const out: BlameLine[] = [];
  const lines = raw.split('\n');
  let sha = '';
  let author = '';
  let date = '';
  let summary = '';
  let lineNo = 0;
  for (const line of lines) {
    const header = line.match(/^([0-9a-f]{40})\s+\d+\s+(\d+)/);
    if (header) {
      sha = header[1]!;
      lineNo = Number(header[2]);
    } else if (line.startsWith('author ')) author = line.slice(7);
    else if (line.startsWith('author-time '))
      date = new Date(Number(line.slice(12)) * 1000).toISOString();
    else if (line.startsWith('summary ')) summary = line.slice(8);
    else if (line.startsWith('\t')) {
      out.push({ line: lineNo, sha, author, date, summary });
    }
  }
  return out;
}
