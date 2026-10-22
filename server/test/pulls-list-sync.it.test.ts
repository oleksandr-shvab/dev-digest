/**
 * GET /repos/:id/pulls — the list sync also stores each PR's changed files in
 * `pr_files` (from the detail fetch the diff-stat backfill already makes), so
 * `GET /pulls/:id/blast` can read them without calling GitHub.
 * Driven through a counting fake GitHub client; gated on Docker like the other
 * integration tests.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { PrDetail, PrMeta, RepoRef } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitHubClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

/** A list payload like Octokit's: no diff stats, files_count 0. */
function listed(number: number, headSha: string): PrMeta {
  return {
    number,
    title: `PR ${number}`,
    author: 'dev',
    branch: `feat/${number}`,
    base: 'main',
    head_sha: headSha,
    additions: 0,
    deletions: 0,
    files_count: 0,
    status: 'open',
    opened_at: '2026-06-01T00:00:00Z',
    updated_at: '2026-06-01T03:00:00Z',
  };
}

/**
 * Fake GitHub: the list and the per-PR detail are mutable between syncs, and
 * every `getPullRequest` call is recorded.
 */
class FakeGitHub extends MockGitHubClient {
  pulls: PrMeta[] = [];
  filesByNumber = new Map<number, string[]>();
  failFor = new Set<number>();
  detailCalls: number[] = [];

  override async listPullRequests(_repo: RepoRef): Promise<PrMeta[]> {
    return this.pulls;
  }

  override async getPullRequest(_repo: RepoRef, n: number): Promise<PrDetail> {
    this.detailCalls.push(n);
    if (this.failFor.has(n)) throw new Error(`GitHub is down for #${n}`);
    const paths = this.filesByNumber.get(n) ?? [];
    const pull = this.pulls.find((p) => p.number === n)!;
    return {
      ...pull,
      additions: paths.length * 3,
      deletions: paths.length,
      files_count: paths.length,
      body: null,
      files: paths.map((path) => ({ path, additions: 3, deletions: 1, patch: `@@ ${path}` })),
      commits: [],
      linked_issue: null,
    };
  }
}

let repoSeq = 0;

d('GET /repos/:id/pulls stores pr_files (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  async function setup() {
    const gh = new FakeGitHub();
    const app = await buildApp({ config: config(), db: pg.handle.db, overrides: { github: gh } });
    const name = `listsync-${repoSeq++}`;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    return { gh, app, repoId: repo!.id };
  }

  async function sync(app: FastifyInstance, repoId: string): Promise<Array<{ id: string; number: number }>> {
    const res = await app.inject({ method: 'GET', url: `/repos/${repoId}/pulls` });
    expect(res.statusCode).toBe(200);
    return res.json() as Array<{ id: string; number: number }>;
  }

  const filesOf = async (app: FastifyInstance, prId: string) =>
    (await app.container.reviewRepo.getPrFiles(prId)).map((f) => f.path).sort();

  it('stores the files of a newly listed PR, readable through getPrFiles', async () => {
    const { gh, app, repoId } = await setup();
    gh.pulls = [listed(1, 'h1')];
    gh.filesByNumber.set(1, ['src/a.ts', 'src/b.ts']);

    const [pr] = await sync(app, repoId);

    expect(gh.detailCalls).toEqual([1]);
    expect(await filesOf(app, pr!.id)).toEqual(['src/a.ts', 'src/b.ts']);
    const rows = await app.container.reviewRepo.getPrFiles(pr!.id);
    expect(rows.find((f) => f.path === 'src/a.ts')).toMatchObject({
      additions: 3,
      deletions: 1,
      patch: '@@ src/a.ts',
    });
  });

  it('a second sync with an unchanged head and stored files makes no detail call', async () => {
    const { gh, app, repoId } = await setup();
    gh.pulls = [listed(1, 'h1'), listed(2, 'h2')];
    gh.filesByNumber.set(1, ['src/a.ts']);
    gh.filesByNumber.set(2, ['src/b.ts']);

    await sync(app, repoId);
    expect(gh.detailCalls.sort()).toEqual([1, 2]);

    gh.detailCalls = [];
    const prs = await sync(app, repoId);
    expect(gh.detailCalls).toEqual([]);
    expect(await filesOf(app, prs.find((p) => p.number === 1)!.id)).toEqual(['src/a.ts']);
  });

  it('refetches and replaces the files when the head sha changes', async () => {
    const { gh, app, repoId } = await setup();
    gh.pulls = [listed(1, 'h1'), listed(2, 'h2')];
    gh.filesByNumber.set(1, ['src/old.ts']);
    gh.filesByNumber.set(2, ['src/keep.ts']);
    await sync(app, repoId);

    gh.detailCalls = [];
    gh.pulls = [listed(1, 'h1-moved'), listed(2, 'h2')];
    gh.filesByNumber.set(1, ['src/new-a.ts', 'src/new-b.ts']);
    const prs = await sync(app, repoId);

    expect(gh.detailCalls).toEqual([1]); // only the PR whose head moved
    expect(await filesOf(app, prs.find((p) => p.number === 1)!.id)).toEqual([
      'src/new-a.ts',
      'src/new-b.ts',
    ]);
    expect(await filesOf(app, prs.find((p) => p.number === 2)!.id)).toEqual(['src/keep.ts']);
  });

  it('logs a failed detail fetch, still answers the list, and leaves pr_files untouched', async () => {
    const { gh, app, repoId } = await setup();
    const warn = vi.spyOn(app.log, 'warn');
    gh.pulls = [listed(1, 'h1')];
    gh.filesByNumber.set(1, ['src/old.ts']);
    await sync(app, repoId);

    // #1 moves its head but GitHub fails for it; #2 is new and GitHub fails too.
    gh.pulls = [listed(1, 'h1-moved'), listed(2, 'h2')];
    gh.failFor = new Set([1, 2]);
    warn.mockClear();
    const prs = await sync(app, repoId);

    expect(prs.map((p) => p.number).sort()).toEqual([1, 2]);
    expect(await filesOf(app, prs.find((p) => p.number === 1)!.id)).toEqual(['src/old.ts']);
    expect(await filesOf(app, prs.find((p) => p.number === 2)!.id)).toEqual([]);
    const backfillWarnings = warn.mock.calls.filter((c) => c[1] === 'PR diff-stat backfill skipped');
    expect(backfillWarnings.map((c) => (c[0] as { number: number }).number).sort()).toEqual([1, 2]);

    // The stats of #1 were not overwritten by the failed fetch either.
    const [row] = await pg.handle.db
      .select()
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.repoId, repoId), eq(t.pullRequests.number, 1)));
    expect(row).toMatchObject({ additions: 3, deletions: 1, filesCount: 1 });
  });
});
