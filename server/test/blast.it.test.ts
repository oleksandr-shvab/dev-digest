import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { count, eq } from 'drizzle-orm';
import { BlastRadius } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient, MockLLMProvider } from '../src/adapters/mocks.js';
import type { BlastResult, RepoIntel } from '../src/modules/repo-intel/types.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[integration] Docker not available — skipping blast.it.test.ts.');
}

const FACADE_RESULT: BlastResult = {
  changedSymbols: [{ file: 'src/middleware/ratelimit.ts', name: 'rateLimit', kind: 'function' }],
  callers: [
    { file: 'src/api/public/webhooks.ts', symbol: 'publicRouter', viaSymbol: 'rateLimit', line: 23, rank: 0.9 },
    // The declaring file itself: the mapper must drop it.
    { file: 'src/middleware/ratelimit.ts', symbol: 'helper', viaSymbol: 'rateLimit', line: 5, rank: 0.5 },
  ],
  impactedEndpoints: ['POST /webhooks'],
  factsByFile: { 'src/api/public/webhooks.ts': { endpoints: ['POST /webhooks'], crons: [] } },
  degraded: false,
};

/** GET /pulls/:id/blast against the seeded PR #482 with a mocked repo-intel facade. */
d('GET /pulls/:id/blast (Testcontainers pg)', () => {
  let pg: PgFixture;
  let prId: string;
  let repoId: string;
  const llmMock = new MockLLMProvider('openai');

  const getBlastRadius = vi.fn(async (_repoId: string, _files: string[]) => FACADE_RESULT);
  const getIndexState = vi.fn(async (id: string) => ({
    repoId: id,
    status: 'partial' as const,
    filesIndexed: 10,
    filesSkipped: 2,
    durationMs: 1,
    lastIndexedSha: 'abc',
    indexerVersion: 2,
    updatedAt: new Date(),
  }));
  const repoIntel = { getBlastRadius, getIndexState } as unknown as RepoIntel;

  const app = () =>
    buildApp({
      config: loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv),
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient(),
        github: new MockGitHubClient(),
        llm: { openai: llmMock },
        repoIntel,
      },
    });

  const jobCount = async () => {
    const [row] = await pg.handle.db.select({ n: count() }).from(t.jobs);
    return row!.n;
  };

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [pr] = await pg.handle.db
      .select()
      .from(t.pullRequests)
      .where(eq(t.pullRequests.number, 482));
    prId = pr!.id;
    repoId = pr!.repoId;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('maps the facade result, tags a partial index, and calls no model and starts no job', async () => {
    const jobsBefore = await jobCount();
    const a = await app();
    const res = await a.inject({ method: 'GET', url: `/pulls/${prId}/blast` });
    expect(res.statusCode).toBe(200);

    const body = BlastRadius.parse(res.json());
    expect(getBlastRadius).toHaveBeenCalledTimes(1);
    const [calledRepoId, calledFiles] = getBlastRadius.mock.calls[0]!;
    expect(calledRepoId).toBe(repoId);
    expect([...calledFiles].sort()).toEqual([
      'src/api/public/webhooks.ts',
      'src/api/users.ts',
      'src/config.ts',
      'src/middleware/ratelimit.ts',
    ]);
    expect(getIndexState).toHaveBeenCalledWith(repoId);

    expect(body).toEqual({
      changed_symbols: [{ name: 'rateLimit', file: 'src/middleware/ratelimit.ts', kind: 'function' }],
      downstream: [
        {
          symbol: 'rateLimit',
          callers: [{ name: 'publicRouter', file: 'src/api/public/webhooks.ts', line: 23 }],
          endpoints_affected: ['POST /webhooks'],
          crons_affected: [],
        },
      ],
      summary: 'symbols: 1, callers: 1, endpoints: 1, crons: 0',
      degraded: true,
      reason: 'index_partial',
    });
    expect(llmMock.calls).toEqual([]);
    expect(await jobCount()).toBe(jobsBefore);
    await a.close();
  });

  it("404 for another workspace's PR, without calling the facade", async () => {
    const db = pg.handle.db;
    const [wsB] = await db.insert(t.workspaces).values({ name: 'Workspace B' }).returning({ id: t.workspaces.id });
    const [repoB] = await db
      .insert(t.repos)
      .values({ workspaceId: wsB!.id, owner: 'other', name: 'wsb-repo', fullName: 'other/wsb-repo' })
      .returning({ id: t.repos.id });
    const [prB] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId: wsB!.id,
        repoId: repoB!.id,
        number: 1,
        title: 'wsB pr',
        author: 'b',
        branch: 'b',
        base: 'main',
        headSha: 'sha',
        additions: 0,
        deletions: 0,
        filesCount: 0,
        status: 'needs_review',
      })
      .returning({ id: t.pullRequests.id });

    getBlastRadius.mockClear();
    const a = await app();
    const res = await a.inject({ method: 'GET', url: `/pulls/${prB!.id}/blast` });
    expect(res.statusCode).toBe(404);
    expect(getBlastRadius).not.toHaveBeenCalled();
    await a.close();
  });

  it('404 for an unknown PR, 422 for a non-uuid id', async () => {
    const a = await app();
    const unknown = await a.inject({
      method: 'GET',
      url: '/pulls/00000000-0000-4000-8000-000000000000/blast',
    });
    expect(unknown.statusCode).toBe(404);
    expect(unknown.json().error.message).toBe('Pull request not found');

    const bad = await a.inject({ method: 'GET', url: '/pulls/not-a-uuid/blast' });
    expect(bad.statusCode).toBe(422);
    await a.close();
  });
});
