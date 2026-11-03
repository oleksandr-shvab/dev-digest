import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Review, RunTrace } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockGitClient, MockSecretsProvider } from '../src/adapters/mocks.js';
import { ReviewRepository } from '../src/modules/reviews/repository.js';
import { ReviewRunExecutor } from '../src/modules/reviews/run-executor.js';
import { IntentDeriver } from '../src/modules/reviews/intent-deriver.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const HEAD = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';

const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

const REVIEW_FIXTURE: Review = {
  verdict: 'comment',
  summary: 'ok',
  score: 90,
  findings: [],
};

/** One token per character: budgets in these tests are exact. */
const charTokenizer = { count: (text: string) => text.length };

let seq = 0;
async function setupRepoAndPr(db: PgFixture['handle']['db'], workspaceId: string) {
  const name = `ctx-run-${seq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 482,
      title: 'Add rate limiting',
      author: 'marisa.koch',
      branch: 'feat/rl',
      base: 'main',
      headSha: 'a1b2c3d4',
      additions: 1,
      deletions: 0,
      filesCount: 1,
      status: 'needs_review',
      body: 'Add rate limiting.',
    })
    .returning();
  await db.insert(t.prFiles).values({
    prId: pr!.id,
    path: 'src/config.ts',
    additions: 1,
    deletions: 0,
    patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
  });
  return { repo: repo!, pr: pr! };
}

d('project context in the run executor (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    ({ workspaceId } = await seed(pg.handle.db));
  });
  afterAll(async () => {
    await pg?.stop();
  });

  async function appWith(git: MockGitClient, env: Record<string, string> = {}) {
    const llm = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE });
    const app = await buildApp({
      config: loadConfig({ ...process.env, NODE_ENV: 'test', ...env } as NodeJS.ProcessEnv),
      db: pg.handle.db,
      overrides: {
        secrets: new MockSecretsProvider(),
        git,
        tokenizer: charTokenizer,
        llm: { openai: llm },
      },
    });
    return { app, llm };
  }
  type App = Awaited<ReturnType<typeof appWith>>['app'];

  const newAgent = async (app: App, name: string) =>
    (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name, provider: 'openai', model: 'gpt-4.1', system_prompt: 'review' },
      })
    ).json().id as string;
  const newSkill = async (app: App, name: string) =>
    (
      await app.inject({
        method: 'POST',
        url: '/skills',
        payload: { name, description: 'd', type: 'rubric', body: 'skill body' },
      })
    ).json().id as string;

  async function reviewAndTrace(app: App, agentId: string): Promise<RunTrace> {
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const res = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId } });
    expect(res.statusCode).toBe(200);
    const [{ run_id: runId }] = res.json().runs as { run_id: string }[];
    const runs = await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
    expect(runs[0]!.status).toBe('done');
    return (await app.inject({ method: 'GET', url: `/runs/${runId}/trace` })).json() as RunTrace;
  }

  it('orders own docs then each enabled skill (deduped, disabled link absent) and puts one untrusted block per doc in the trace', async () => {
    const { app } = await appWith(
      new MockGitClient({
        diff: DIFF,
        head: HEAD,
        files: {
          'specs/own.md': '# own',
          'specs/dup.md': '# dup',
          'docs/skill.md': '# skill doc',
          'docs/off.md': '# off',
        },
      }),
    );
    const agentId = await newAgent(app, 'Order agent');
    const on = await newSkill(app, 'order-on');
    const off = await newSkill(app, 'order-off');
    await app.inject({
      method: 'PUT',
      url: `/agents/${agentId}/context`,
      payload: { paths: ['specs/own.md', 'specs/dup.md'] },
    });
    await app.inject({
      method: 'PUT',
      url: `/skills/${on}/context`,
      payload: { paths: ['specs/dup.md', 'docs/skill.md'] },
    });
    await app.inject({ method: 'PUT', url: `/skills/${off}/context`, payload: { paths: ['docs/off.md'] } });
    await app.inject({
      method: 'PUT',
      url: `/agents/${agentId}/skills`,
      payload: {
        items: [
          { skill_id: on, enabled: true },
          { skill_id: off, enabled: false },
        ],
      },
    });

    const trace = await reviewAndTrace(app, agentId);

    expect(trace.specs_read).toEqual(['specs/own.md', 'specs/dup.md', 'docs/skill.md']);
    expect(trace.project_context).toEqual({
      commit: HEAD,
      docs: [
        { path: 'specs/own.md', tokens: 5, status: 'included' },
        { path: 'specs/dup.md', tokens: 5, status: 'included' },
        { path: 'docs/skill.md', tokens: 11, status: 'included' },
      ],
    });
    const specs = trace.prompt_assembly.specs ?? '';
    const labels = [...specs.matchAll(/<untrusted source="([^"]+)">/g)].map((m) => m[1]);
    expect(labels).toEqual(['specs/own.md', 'specs/dup.md', 'docs/skill.md']);
    expect(specs).toContain('# skill doc');
    expect(specs).not.toContain('docs/off.md');
    expect(trace.config.source).toBe('local');
  });

  it('marks missing, symlink and non-UTF-8 docs missing and still finishes the run', async () => {
    const { app } = await appWith(
      new MockGitClient({
        diff: DIFF,
        head: HEAD,
        files: { 'specs/ok.md': '# ok', 'docs/bin.md': Buffer.from([0xff, 0xfe, 0x00]) },
        symlinks: ['specs/link.md'],
      }),
    );
    const agentId = await newAgent(app, 'Missing agent');
    await app.inject({
      method: 'PUT',
      url: `/agents/${agentId}/context`,
      payload: { paths: ['specs/gone.md', 'docs/bin.md', 'specs/link.md', 'specs/ok.md'] },
    });
    const trace = await reviewAndTrace(app, agentId);
    expect(trace.project_context!.docs.map((x) => [x.path, x.status])).toEqual([
      ['specs/gone.md', 'missing'],
      ['docs/bin.md', 'missing'],
      ['specs/link.md', 'missing'],
      ['specs/ok.md', 'included'],
    ]);
    expect(trace.specs_read).toEqual(['specs/ok.md']);
  });

  it('skips a whole over-budget doc and still includes a later smaller one', async () => {
    const { app } = await appWith(
      new MockGitClient({
        diff: DIFF,
        head: HEAD,
        files: { 'docs/big.md': 'x'.repeat(500), 'docs/small.md': '# small' },
      }),
      { PROJECT_CONTEXT_BUDGET_TOKENS: '100' },
    );
    const agentId = await newAgent(app, 'Budget agent');
    await app.inject({
      method: 'PUT',
      url: `/agents/${agentId}/context`,
      payload: { paths: ['docs/big.md', 'docs/small.md'] },
    });
    const trace = await reviewAndTrace(app, agentId);
    expect(trace.project_context!.docs.map((x) => [x.path, x.status])).toEqual([
      ['docs/big.md', 'skipped_budget'],
      ['docs/small.md', 'included'],
    ]);
    expect(trace.specs_read).toEqual(['docs/small.md']);
    expect(trace.prompt_assembly.specs ?? '').not.toContain('xxxxx');
  });

  it('makes no extra LLM call for attached docs', async () => {
    const files = { 'specs/a.md': '# a', 'specs/b.md': '# b' };
    const plain = await appWith(new MockGitClient({ diff: DIFF, head: HEAD, files }));
    const plainAgent = await newAgent(plain.app, 'No docs agent');
    await reviewAndTrace(plain.app, plainAgent);

    const withDocs = await appWith(new MockGitClient({ diff: DIFF, head: HEAD, files }));
    const docsAgent = await newAgent(withDocs.app, 'Docs agent');
    await withDocs.app.inject({
      method: 'PUT',
      url: `/agents/${docsAgent}/context`,
      payload: { paths: ['specs/a.md', 'specs/b.md'] },
    });
    await reviewAndTrace(withDocs.app, docsAgent);

    expect(plain.llm.calls.length).toBeGreaterThan(0);
    expect(withDocs.llm.calls.length).toBe(plain.llm.calls.length);
  });

  it('records no project_context for an agent without attachments', async () => {
    const { app } = await appWith(new MockGitClient({ diff: DIFF, head: HEAD, files: { 'specs/a.md': '# a' } }));
    const agentId = await newAgent(app, 'Bare agent');
    const trace = await reviewAndTrace(app, agentId);
    expect(trace.project_context).toBeUndefined();
    expect(trace.specs_read).toEqual([]);
  });

  it('a ci-source job sends no specs, records no project_context and marks the trace ci', async () => {
    const { app } = await appWith(
      new MockGitClient({ diff: DIFF, head: HEAD, files: { 'specs/a.md': '# secret doc' } }),
    );
    const agentId = await newAgent(app, 'CI agent');
    await app.inject({ method: 'PUT', url: `/agents/${agentId}/context`, payload: { paths: ['specs/a.md'] } });
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    // Built the way ReviewService builds it (reviews/service.ts).
    const container = app.container;
    const reviewRepo = new ReviewRepository(container.db);
    const executor = new ReviewRunExecutor(
      container,
      reviewRepo,
      container.agentsRepo,
      new IntentDeriver(container, reviewRepo),
    );
    const agent = (await container.agentsRepo.getById(workspaceId, agentId))!;
    const pull = (await reviewRepo.getPull(workspaceId, pr.id))!;
    const repo = (await reviewRepo.getRepo(pull.repoId))!;
    const runId = await reviewRepo.createAgentRun({
      workspaceId,
      agentId,
      prId: pr.id,
      provider: agent.provider,
      model: agent.model,
      multiAgentRunId: null,
    });

    await executor.executeRuns(workspaceId, pull, repo, [{ agent, runId, source: 'ci' }]);

    const trace = (await app.inject({ method: 'GET', url: `/runs/${runId}/trace` })).json() as RunTrace;
    expect(trace.config.source).toBe('ci');
    expect(trace.project_context).toBeUndefined();
    expect(trace.specs_read).toEqual([]);
    expect(JSON.stringify(trace.prompt_assembly)).not.toContain('secret doc');
  });
});
