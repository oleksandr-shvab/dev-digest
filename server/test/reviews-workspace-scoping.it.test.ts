import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import type { RunTrace } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import * as t from '../src/db/schema.js';
import {
  cancelRunIfRunning,
  getRunTrace,
  runBelongsToWorkspace,
  createAgentRun,
  saveRunTrace,
} from '../src/modules/reviews/repository/run.repo.js';
import { RepoRepository } from '../src/modules/repos/repository.js';

const TRACE_FIXTURE: RunTrace = {
  config: { agent: 'Test Agent', model: 'gpt-4.1', source: 'local' },
  stats: { duration_ms: 1, tokens_in: 1, tokens_out: 1, cost_usd: null, findings: 0, grounding: '0/0 passed' },
  prompt_assembly: { system: 's', user: 'u' },
  tool_calls: [],
  raw_output: '{}',
  memory_pulled: [],
  specs_read: [],
  log: [],
};

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

/**
 * SECURITY: covers the workspace-scoping fix for `cancelRunIfRunning`,
 * `getRunTrace`, `runBelongsToWorkspace` (reviews/repository/run.repo.ts)
 * and `RepoRepository.getById` (repos/repository.ts, already scoped —
 * pinned here alongside the others as the cross-module authorization check
 * used by repo-intel routes). Before the fix, `cancelRunIfRunning` and
 * `getRunTrace` took no `workspaceId` at all, so any caller could act on or
 * read another workspace's run by id alone.
 */
d('reviews repository — workspace scoping (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceA: string;
  let workspaceB: string;
  let prA: string;
  let runIdInA: string;

  beforeAll(async () => {
    pg = await startPg();
    const db = pg.handle.db;

    const [wsA] = await db
      .insert(t.workspaces)
      .values({ name: 'Workspace A' })
      .returning({ id: t.workspaces.id });
    const [wsB] = await db
      .insert(t.workspaces)
      .values({ name: 'Workspace B' })
      .returning({ id: t.workspaces.id });
    workspaceA = wsA!.id;
    workspaceB = wsB!.id;

    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId: workspaceA, owner: 'acme', name: 'wsa-repo', fullName: 'acme/wsa-repo' })
      .returning({ id: t.repos.id });

    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId: workspaceA,
        repoId: repo!.id,
        number: 1,
        title: 'wsA pr',
        author: 'a',
        branch: 'b',
        base: 'main',
        headSha: 'sha',
        additions: 0,
        deletions: 0,
        filesCount: 0,
        status: 'needs_review',
      })
      .returning({ id: t.pullRequests.id });
    prA = pr!.id;

    runIdInA = await createAgentRun(db, {
      workspaceId: workspaceA,
      agentId: null,
      prId: prA,
      provider: 'openai',
      model: 'gpt-4.1',
      multiAgentRunId: null,
    });
    await saveRunTrace(db, runIdInA, TRACE_FIXTURE);
  });

  afterAll(async () => {
    await pg?.stop();
  });

  it('runBelongsToWorkspace: true for the owning workspace, false for another', async () => {
    const db = pg.handle.db;
    expect(await runBelongsToWorkspace(db, workspaceA, runIdInA)).toBe(true);
    expect(await runBelongsToWorkspace(db, workspaceB, runIdInA)).toBe(false);
  });

  it('getRunTrace: readable from the owning workspace, not from another', async () => {
    const db = pg.handle.db;
    expect(await getRunTrace(db, workspaceA, runIdInA)).toBeDefined();
    expect(await getRunTrace(db, workspaceB, runIdInA)).toBeUndefined();
  });

  it('cancelRunIfRunning: a no-op from a different workspace, real from the owner', async () => {
    const db = pg.handle.db;
    // Wrong workspace: run stays untouched.
    expect(await cancelRunIfRunning(db, workspaceB, runIdInA)).toBe(false);
    const [stillRunning] = await db
      .select({ status: t.agentRuns.status })
      .from(t.agentRuns)
      .where(eq(t.agentRuns.id, runIdInA));
    expect(stillRunning?.status ?? 'running').toBe('running');

    // Owning workspace: actually cancels.
    expect(await cancelRunIfRunning(db, workspaceA, runIdInA)).toBe(true);
  });

  it('RepoRepository.getById: not visible from another workspace', async () => {
    const repos = new RepoRepository(pg.handle.db);
    const [repoRow] = await pg.handle.db
      .select({ id: t.repos.id })
      .from(t.repos)
      .where(eq(t.repos.workspaceId, workspaceA));
    expect(await repos.getById(workspaceA, repoRow!.id)).toBeDefined();
    expect(await repos.getById(workspaceB, repoRow!.id)).toBeUndefined();
  });
});
