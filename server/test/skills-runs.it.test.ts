import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockLLMProvider, MockGitClient, MockEmbedder } from '../src/adapters/mocks.js';
import type { StructuredRequest, StructuredResult, Review, RunTrace } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[skills-runs] Docker not available — skipping integration tests.');
}

const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

const REVIEW: Review = {
  verdict: 'comment',
  summary: 'One issue.',
  score: 80,
  findings: [
    {
      id: 'f1', severity: 'WARNING', category: 'bug', title: 'Untested branch',
      file: 'src/config.ts', start_line: 11, end_line: 11,
      rationale: 'No test.', confidence: 0.9, kind: 'finding',
    },
  ],
};

/** An LLM that always fails — to prove failed runs write no run_skills. */
class FailingLLM extends MockLLMProvider {
  override async completeStructured<T>(_req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    throw new Error('provider exploded');
  }
}

d('skills in the review pipeline + stats (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let repoSeq = 0;

  beforeAll(async () => {
    pg = await startPg();
    ({ workspaceId } = await seed(pg.handle.db));
  });
  afterAll(async () => {
    await pg?.stop();
  });

  const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

  function makeApp(llm: MockLLMProvider) {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        llm: { openai: llm },
      },
    });
  }

  async function newPr() {
    const db = pg.handle.db;
    const name = `skills-repo-${repoSeq++}`;
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId, repoId: repo!.id, number: 1, title: 'PR', author: 'a', branch: 'f', base: 'main',
        headSha: 'abc123', additions: 1, deletions: 0, filesCount: 1, status: 'needs_review',
      })
      .returning();
    await db.insert(t.prFiles).values({
      prId: pr!.id, path: 'src/config.ts', additions: 1, deletions: 0,
      patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
    });
    return pr!;
  }

  type App = Awaited<ReturnType<typeof makeApp>>;
  async function mk(app: App, name: string, body = `Body of ${name}`) {
    const res = await app.inject({
      method: 'POST', url: '/skills',
      payload: { name, description: `Desc of ${name}`, type: 'rubric', body },
    });
    return res.json() as { id: string; version: number };
  }
  async function agentWith(app: App, name: string) {
    const res = await app.inject({
      method: 'POST', url: '/agents',
      payload: { name, provider: 'openai', model: 'gpt-4.1', system_prompt: 'review', repo_intel: false },
    });
    return res.json().id as string;
  }

  it('passes ONLY enabled skills, in the agent order, logs them, records run_skills + trace', async () => {
    const llm = new MockLLMProvider('openai', { structured: REVIEW });
    const app = await makeApp(llm);
    const agentId = await agentWith(app, 'Skilled Agent');
    const s1 = await mk(app, 'run-first');
    const s2 = await mk(app, 'run-agent-off');
    const s3 = await mk(app, 'run-global-off');
    const s4 = await mk(app, 'run-last');
    // bump s4 to v2 so we can see the version recorded
    await app.inject({ method: 'PUT', url: `/skills/${s4.id}`, payload: { body: 'Body of run-last v2' } });
    await app.inject({
      method: 'PUT', url: `/agents/${agentId}/skills`,
      payload: {
        items: [
          { skill_id: s4.id, enabled: true },   // order 0 (linked first → prompt first)
          { skill_id: s2.id, enabled: false },
          { skill_id: s3.id, enabled: true },
          { skill_id: s1.id, enabled: true },
        ],
      },
    });
    await app.inject({ method: 'PUT', url: `/skills/${s3.id}`, payload: { enabled: false } });

    const pr = await newPr();
    const res = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId } });
    expect(res.statusCode).toBe(200);
    const runId = res.json().runs[0].run_id as string;
    const [run] = await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
    expect(run!.error).toBeNull();
    expect(run!.status).toBe('done');

    // the actual LLM request: skills block present, ordered, disabled ones absent
    const req = llm.calls.find((c) => c.method === 'completeStructured')!.req as StructuredRequest<unknown>;
    const user = req.messages[1]!.content;
    expect(user).toContain('## Skills / rules');
    const iLast = user.indexOf('### run-last (v2)\nDesc of run-last\n\nBody of run-last v2');
    const iFirst = user.indexOf('### run-first (v1)\nDesc of run-first\n\nBody of run-first');
    expect(iLast).toBeGreaterThan(-1);
    expect(iFirst).toBeGreaterThan(iLast); // agent order, not name order
    expect(user).not.toContain('run-agent-off');
    expect(user).not.toContain('run-global-off');

    // run_skills rows: only the two applied
    const rows = await pg.handle.db.select().from(t.runSkills).where(eq(t.runSkills.runId, runId));
    expect(rows.map((r) => [r.skillId, r.skillVersion]).sort()).toEqual(
      [[s4.id, 2], [s1.id, 1]].sort(),
    );
    expect(rows.every((r) => r.tokens > 0)).toBe(true);

    // trace: skills_applied (ordered, with provenance) + prompt_assembly.skills + log lines
    const trace = (await app.inject({ method: 'GET', url: `/runs/${runId}/trace` })).json() as RunTrace;
    expect(trace.skills_applied?.map((s) => [s.name, s.version, s.source])).toEqual([
      ['run-last', 2, 'manual'],
      ['run-first', 1, 'manual'],
    ]);
    expect(trace.skills_applied!.map((s) => s.id)).toEqual([s4.id, s1.id]);
    expect(trace.prompt_assembly.skills).toContain('### run-last (v2)');
    const logs = trace.log.map((l) => l.msg);
    expect(logs.some((m) => /^Skills: 2 active · ~\d+(\.\d)?k? tokens$/.test(m))).toBe(true);
    expect(logs.some((m) => /^ {2}run-last v2 · \d+ tokens$/.test(m))).toBe(true);
    expect(logs.some((m) => /^ {2}run-first v1 · \d+ tokens$/.test(m))).toBe(true);
    expect(logs.some((m) => m.includes('run-agent-off') || m.includes('run-global-off'))).toBe(false);
    await app.close();
  });

  it('an agent with no active skills: no skills section, no run_skills, no skills_applied', async () => {
    const llm = new MockLLMProvider('openai', { structured: REVIEW });
    const app = await makeApp(llm);
    const agentId = await agentWith(app, 'Bare Agent');
    const s = await mk(app, 'bare-off');
    await app.inject({ method: 'PUT', url: `/agents/${agentId}/skills`, payload: { items: [{ skill_id: s.id, enabled: false }] } });

    const pr = await newPr();
    const runId = (await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId } })).json().runs[0].run_id;
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });

    const req = llm.calls.find((c) => c.method === 'completeStructured')!.req as StructuredRequest<unknown>;
    expect(req.messages[1]!.content).not.toContain('## Skills / rules');
    expect(await pg.handle.db.select().from(t.runSkills).where(eq(t.runSkills.runId, runId))).toHaveLength(0);
    const trace = (await app.inject({ method: 'GET', url: `/runs/${runId}/trace` })).json() as RunTrace;
    expect(trace.skills_applied).toBeUndefined();
    expect(trace.log.some((l) => l.msg.startsWith('Skills:'))).toBe(false);
    await app.close();
  });

  it('a failed run writes no run_skills rows', async () => {
    const app = await makeApp(new FailingLLM('openai'));
    const agentId = await agentWith(app, 'Failing Agent');
    const s = await mk(app, 'fail-skill');
    await app.inject({ method: 'PUT', url: `/agents/${agentId}/skills`, payload: { items: [{ skill_id: s.id, enabled: true }] } });

    const pr = await newPr();
    const runId = (await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId } })).json().runs[0].run_id;
    const [run] = await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
    expect(run!.status).toBe('failed');
    expect(await pg.handle.db.select().from(t.runSkills).where(eq(t.runSkills.runId, runId))).toHaveLength(0);
    await app.close();
  });

  it('stats: pull rate, accept rate, by-category, used-by, and the 30-day cut-off', async () => {
    const db = pg.handle.db;
    const app = await makeApp(new MockLLMProvider('openai', { structured: REVIEW }));
    const skill = await mk(app, 'stats-skill');
    const idle = await mk(app, 'stats-idle');
    const agentA = await agentWith(app, 'Stats Agent A');
    const agentB = await agentWith(app, 'Stats Agent B');
    for (const a of [agentA, agentB]) {
      await app.inject({ method: 'PUT', url: `/agents/${a}/skills`, payload: { items: [{ skill_id: skill.id, enabled: a === agentA }] } });
    }
    const pr = await newPr();
    const day = 24 * 60 * 60 * 1000;
    const daysAgo = (n: number) => new Date(Date.now() - n * day);

    async function run(agentId: string, o: { status?: string; ranAt?: Date; applied?: boolean; findings?: { category: string; accepted?: boolean; dismissed?: boolean }[] }) {
      const [r] = await db
        .insert(t.agentRuns)
        .values({ workspaceId, agentId, prId: pr.id, status: o.status ?? 'done', ranAt: o.ranAt ?? new Date() })
        .returning();
      if (o.applied) await db.insert(t.runSkills).values({ runId: r!.id, skillId: skill.id, skillVersion: 1, tokens: 10 });
      if (o.findings) {
        const [rev] = await db
          .insert(t.reviews)
          .values({ workspaceId, prId: pr.id, agentId, runId: r!.id, kind: 'review' })
          .returning();
        await db.insert(t.findings).values(
          o.findings.map((f, i) => ({
            reviewId: rev!.id, file: 'a.ts', startLine: i + 1, endLine: i + 1, severity: 'WARNING',
            category: f.category, title: 't', rationale: 'r', confidence: 0.9,
            acceptedAt: f.accepted ? new Date() : null, dismissedAt: f.dismissed ? new Date() : null,
          })),
        );
      }
      return r!;
    }

    // Applied, in window: 3 findings (2 tests, 1 bug); 1 accepted, 1 dismissed, 1 untriaged
    await run(agentA, { applied: true, findings: [
      { category: 'tests', accepted: true }, { category: 'tests', dismissed: true }, { category: 'bug' },
    ] });
    // Applied, in window, no findings
    await run(agentB, { applied: true });
    // Same agent, in window, but skill NOT applied (skills off at the time) → lowers the pull rate
    await run(agentA, {});
    await run(agentB, {});
    // Excluded: outside the 30-day window (even though the skill was applied + findings)
    await run(agentA, { applied: true, ranAt: daysAgo(31), findings: [{ category: 'old', accepted: true }] });
    // Excluded: failed / cancelled runs never count
    await run(agentA, { status: 'failed', ranAt: new Date() });
    await run(agentA, { status: 'cancelled' });

    const stats = (await app.inject({ method: 'GET', url: `/skills/${skill.id}/stats` })).json();
    expect(stats).toEqual({
      used_by: 2,
      pull_rate: 0.5, // 2 applied / 4 done runs in window by agents linking it
      accept_rate: 0.5, // 1 accepted / (1 + 1 dismissed)
      window_days: 30,
      findings: 3,
      agents: [
        { id: agentA, name: 'Stats Agent A', enabled: true },
        { id: agentB, name: 'Stats Agent B', enabled: false },
      ],
      by_category: [
        { category: 'tests', count: 2 },
        { category: 'bug', count: 1 },
      ],
    });

    // list + detail carry the same summary; an unused skill is all null/0
    const list = (await app.inject({ method: 'GET', url: '/skills' })).json() as { id: string; stats: unknown }[];
    expect(list.find((s) => s.id === skill.id)!.stats).toEqual({ used_by: 2, pull_rate: 0.5, accept_rate: 0.5 });
    expect(list.find((s) => s.id === idle.id)!.stats).toEqual({ used_by: 0, pull_rate: null, accept_rate: null });
    expect((await app.inject({ method: 'GET', url: `/skills/${skill.id}` })).json().stats).toEqual({
      used_by: 2, pull_rate: 0.5, accept_rate: 0.5,
    });
    const idleStats = (await app.inject({ method: 'GET', url: `/skills/${idle.id}/stats` })).json();
    expect(idleStats).toMatchObject({ findings: 0, by_category: [], agents: [], pull_rate: null, accept_rate: null });

    // deleting the skill cascades run_skills but keeps the runs
    const runsBefore = (await db.select().from(t.agentRuns).where(eq(t.agentRuns.prId, pr.id))).length;
    await app.inject({ method: 'DELETE', url: `/skills/${skill.id}` });
    expect(await db.select().from(t.runSkills).where(eq(t.runSkills.skillId, skill.id))).toHaveLength(0);
    expect((await db.select().from(t.agentRuns).where(eq(t.agentRuns.prId, pr.id))).length).toBe(runsBefore);
    await app.close();
  });
});
