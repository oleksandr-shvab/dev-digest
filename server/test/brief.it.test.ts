import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import type { StructuredRequest } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import {
  MockGitClient,
  MockGitHubClient,
  MockLLMProvider,
  MockSecretsProvider,
} from '../src/adapters/mocks.js';
import { TiktokenTokenizer } from '../src/adapters/tokenizer/index.js';
import { BriefService } from '../src/modules/brief/service.js';
import type { BlastResult, RepoIntel } from '../src/modules/repo-intel/types.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[brief] Docker not available — skipping integration tests.');
}

const HEAD = 'd'.repeat(12);

const CONFIG_PATCH = '@@ -9,3 +9,6 @@\n a\n b\n c\n+x\n+y\n+z';
const USERS_PATCH = '@@ -44,2 +44,3 @@\n a\n+x\n b';

const BLAST: BlastResult = {
  changedSymbols: [{ file: 'src/config.ts', name: 'loadConfig', kind: 'function' }],
  callers: [{ file: 'src/caller.ts', symbol: 'boot', viaSymbol: 'loadConfig', line: 3, rank: 1 }],
  impactedEndpoints: [],
  factsByFile: { 'src/caller.ts': { endpoints: [], crons: [] } },
  degraded: false,
};

const NO_DATA_BLAST: BlastResult = {
  changedSymbols: [],
  callers: [],
  impactedEndpoints: [],
  degraded: true,
  reason: 'no_data',
};

function makeIntel(result: BlastResult = BLAST, status: 'full' | 'partial' = 'full'): RepoIntel {
  return {
    getBlastRadius: async () => result,
    getIndexState: async (repoId: string) => ({
      repoId,
      status,
      filesIndexed: 10,
      filesSkipped: 0,
      durationMs: 1,
      lastIndexedSha: 'abc',
      indexerVersion: 2,
      updatedAt: new Date(0),
    }),
  } as unknown as RepoIntel;
}

const FIXTURE = {
  summary: 'Adds a limiter and moves the config loader.',
  risks: [
    {
      kind: 'security',
      title: 'Config loader change',
      explanation: 'The loader now reads more keys.',
      severity: 'high',
      files: ['src/config.ts', 'src/ghost.ts'],
    },
    {
      kind: 'ghost',
      title: 'Only an invented file',
      explanation: 'No real file backs this.',
      severity: 'low',
      files: ['src/ghost.ts'],
    },
  ],
  review_focus: [
    { file: 'src/config.ts', line: 12, reason: 'The flagged line' },
    { file: 'src/ghost.ts', line: 1, reason: 'Invented' },
    { file: 'src/api/users.ts', line: 99, reason: 'Cited line is not in a finding' },
    { file: 'src/caller.ts', line: 3, reason: 'Blast-only caller' },
  ],
};

/** An LLM whose answer can be held back, failed or never given. */
class ScriptedLLM extends MockLLMProvider {
  started = 0;
  script?: () => Promise<void>;
  async completeStructured<T>(req: StructuredRequest<T>) {
    this.started += 1;
    if (this.script) await this.script();
    return super.completeStructured(req);
  }
  structuredCalls() {
    return this.calls
      .filter((c) => c.method === 'completeStructured')
      .map((c) => c.req as StructuredRequest<unknown>);
  }
}

const newLlm = () => new ScriptedLLM('openai', { structuredBySchema: { PrBriefGeneration: FIXTURE } });

const noopLog = { info: () => undefined, warn: () => undefined, error: () => undefined, debug: () => undefined };

d('PR brief (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let repoId: string;
  let repoFullName: string;

  beforeAll(async () => {
    pg = await startPg();
    ({ workspaceId } = await seed(pg.handle.db));
    const [pr] = await pg.handle.db.select().from(t.pullRequests).where(eq(t.pullRequests.number, 482));
    repoId = pr!.repoId;
    const [repo] = await pg.handle.db.select().from(t.repos).where(eq(t.repos.id, repoId));
    repoFullName = repo!.fullName;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  async function makePr(
    opts: { body?: string | null; files?: boolean; withFinding?: boolean; workspace?: string; repo?: string } = {},
  ) {
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId: opts.workspace ?? workspaceId,
        repoId: opts.repo ?? repoId,
        number: 100_000 + Math.floor(Math.random() * 900_000),
        title: 'Move the config loader',
        author: 'dev',
        branch: 'feat/config',
        base: 'main',
        headSha: HEAD,
        additions: 4,
        deletions: 0,
        filesCount: 2,
        body: opts.body ?? null,
      })
      .returning();
    if (opts.files !== false) {
      await pg.handle.db.insert(t.prFiles).values([
        { prId: pr!.id, path: 'src/config.ts', additions: 3, deletions: 0, patch: CONFIG_PATCH },
        { prId: pr!.id, path: 'src/api/users.ts', additions: 1, deletions: 0, patch: USERS_PATCH },
      ]);
    }
    if (opts.withFinding !== false && opts.files !== false) {
      const [review] = await pg.handle.db
        .insert(t.reviews)
        .values({
          workspaceId,
          prId: pr!.id,
          agentId: null,
          kind: 'review',
          verdict: 'request_changes',
          summary: 's',
          score: 60,
          model: 'seed',
        })
        .returning();
      await pg.handle.db.insert(t.findings).values({
        reviewId: review!.id,
        file: 'src/config.ts',
        startLine: 12,
        endLine: 12,
        severity: 'CRITICAL',
        category: 'security',
        title: 'Hardcoded key',
        rationale: 'r',
        confidence: 0.9,
      });
    }
    return pr!;
  }

  async function makeApp(
    opts: {
      llm?: ScriptedLLM;
      intel?: RepoIntel;
      git?: MockGitClient;
      github?: MockGitHubClient;
      llmProviders?: ('openai' | 'openrouter')[];
      config?: Partial<ReturnType<typeof loadConfig>>;
    } = {},
  ) {
    const config = {
      ...loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv),
      ...opts.config,
    };
    const llm = opts.llm ?? newLlm();
    const providers = opts.llmProviders ?? ['openai', 'openrouter'];
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        git: opts.git ?? new MockGitClient(),
        github: opts.github ?? new MockGitHubClient(),
        secrets: new MockSecretsProvider({}),
        llm: Object.fromEntries(providers.map((p) => [p, llm])),
        repoIntel: opts.intel ?? makeIntel(),
      },
    });
  }

  type App = Awaited<ReturnType<typeof makeApp>>;
  const getState = async (app: App, prId: string) =>
    (await app.inject({ method: 'GET', url: `/pulls/${prId}/brief` })).json();
  const generate = (app: App, prId: string) =>
    app.inject({ method: 'POST', url: `/pulls/${prId}/brief` });

  async function waitForIdle(app: App, prId: string) {
    for (let i = 0; i < 200; i += 1) {
      const state = await getState(app, prId);
      if (!state.generating) return state;
      await new Promise((r) => setTimeout(r, 25));
    }
    throw new Error('generation did not finish');
  }

  async function waitForStarted(llm: ScriptedLLM) {
    for (let i = 0; i < 200 && llm.started === 0; i += 1) await new Promise((r) => setTimeout(r, 10));
  }

  async function setBriefModel(app: App, provider: string, model: string) {
    const res = await app.inject({
      method: 'PUT',
      url: '/settings',
      payload: { feature_models: { risk_brief: { provider, model } } },
    });
    expect(res.statusCode).toBe(200);
  }

  // NOTE: this case runs before any case sets `feature_models.risk_brief`.
  it('uses the registry default model when no setting exists (AC-13)', async () => {
    const llm = newLlm();
    const app = await makeApp({ llm });
    const pr = await makePr();
    expect((await generate(app, pr.id)).statusCode).toBe(202);
    await waitForIdle(app, pr.id);
    expect(llm.structuredCalls()).toHaveLength(1);
    expect(llm.structuredCalls()[0]).toMatchObject({ model: 'gpt-4.1' });
    await app.close();
  });

  it('generates with the configured model, one capped call and a grounded stored brief (AC-9, AC-11, AC-13, AC-24)', async () => {
    const llm = newLlm();
    const app = await makeApp({ llm });
    await setBriefModel(app, 'openai', 'gpt-brief');
    const pr = await makePr();

    const before = await getState(app, pr.id);
    expect(before).toMatchObject({ brief: null, generating: false, last_error: null, stale: false });
    expect(llm.calls).toHaveLength(0);

    const res = await generate(app, pr.id);
    expect(res.statusCode).toBe(202);
    expect(res.json().generating).toBe(true);

    const state = await waitForIdle(app, pr.id);
    const calls = llm.structuredCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      model: 'gpt-brief',
      maxRetries: 0,
      maxTokens: 1500,
      schemaName: 'PrBriefGeneration',
    });
    expect('tools' in calls[0]!).toBe(false);

    expect(state).toMatchObject({
      pr_id: pr.id,
      provider: 'openai',
      model: 'gpt-brief',
      tokens_in: 100,
      tokens_out: 50,
      cost_usd: 0.001,
      head_sha: HEAD,
      stale: false,
      last_error: null,
    });
    expect(state.generated_at).toEqual(expect.any(String));

    // Grounded (AC-7, AC-17, AC-18): the ghost file and the all-ghost risk are gone.
    expect(state.brief.summary).toBe(FIXTURE.summary);
    expect(state.brief.risks).toHaveLength(1);
    expect(state.brief.risks[0].file_refs).toEqual(['src/config.ts']);
    expect(state.brief.review_focus).toEqual([
      { file: 'src/config.ts', line: 12, reason: 'The flagged line' },
      { file: 'src/api/users.ts', line: 45, reason: 'Cited line is not in a finding' },
      { file: 'src/caller.ts', line: null, reason: 'Blast-only caller' },
    ]);

    // Reads add no call.
    await getState(app, pr.id);
    await getState(app, pr.id);
    expect(llm.structuredCalls()).toHaveLength(1);
    await app.close();
  });

  it('names the inputs the brief was generated without (AC-6)', async () => {
    const llm = newLlm();
    const app = await makeApp({
      llm,
      intel: makeIntel(NO_DATA_BLAST),
      github: new MockGitHubClient({ missingIssues: [999] }),
    });
    const pr = await makePr({ body: 'Fixes #999' });
    await generate(app, pr.id);
    const state = await waitForIdle(app, pr.id);

    expect(state.brief).not.toBeNull();
    expect(state.unavailable_inputs).toHaveLength(4);
    expect(state.unavailable_inputs).toEqual(
      expect.arrayContaining([
        { kind: 'intent', ref: null },
        { kind: 'blast_radius', ref: null },
        { kind: 'specs', ref: null },
        { kind: 'linked_issue', ref: `${repoFullName}#999` },
      ]),
    );
    await app.close();
  });

  it('keeps an invented path out of the stored brief (AC-7)', async () => {
    const app = await makeApp();
    const pr = await makePr();
    await generate(app, pr.id);
    await waitForIdle(app, pr.id);
    const [row] = await pg.handle.db.select().from(t.prBrief).where(eq(t.prBrief.prId, pr.id));
    expect(JSON.stringify(row!.json)).not.toContain('src/ghost.ts');
    await app.close();
  });

  it('reads specs of a disabled agent and of an enabled skill, and fits an oversized input to 8,000 tokens (AC-14, AC-15)', async () => {
    const [disabledAgent] = await pg.handle.db
      .insert(t.agents)
      .values({
        workspaceId,
        name: `brief-disabled-${randomUUID().slice(0, 6)}`,
        provider: 'openai',
        model: 'm',
        systemPrompt: 'p',
        enabled: false,
        contextPaths: ['docs/spec-a.md'],
      })
      .returning();
    const [enabledAgent] = await pg.handle.db
      .insert(t.agents)
      .values({
        workspaceId,
        name: `brief-enabled-${randomUUID().slice(0, 6)}`,
        provider: 'openai',
        model: 'm',
        systemPrompt: 'p',
      })
      .returning();
    const [skill] = await pg.handle.db
      .insert(t.skills)
      .values({
        workspaceId,
        name: `brief-skill-${randomUUID().slice(0, 6)}`,
        description: 'd',
        type: 'custom',
        source: 'manual',
        body: 'b',
        contextPaths: ['docs/spec-b.md'],
      })
      .returning();
    await pg.handle.db.insert(t.agentSkills).values({ agentId: enabledAgent!.id, skillId: skill!.id });

    try {
      // A small input: both specs reach the model.
      const smallLlm = newLlm();
      const smallApp = await makeApp({
        llm: smallLlm,
        git: new MockGitClient({
          files: { 'docs/spec-a.md': '# A\nSPEC_A_MARKER', 'docs/spec-b.md': '# B\nSPEC_B_MARKER' },
        }),
      });
      const smallPr = await makePr();
      await generate(smallApp, smallPr.id);
      const small = await waitForIdle(smallApp, smallPr.id);
      const sent = JSON.stringify(smallLlm.structuredCalls()[0]!.messages);
      expect(sent).toContain('SPEC_A_MARKER');
      expect(sent).toContain('SPEC_B_MARKER');
      expect(small.omitted_inputs).toEqual([]);
      expect(small.unavailable_inputs.filter((u: { kind: string }) => u.kind === 'specs')).toEqual([]);
      await smallApp.close();

      // An oversized input: the specs are trimmed to fit.
      const bigText = (marker: string) => `# ${marker}\n${'word '.repeat(5000)}`;
      const bigLlm = newLlm();
      const bigApp = await makeApp({
        llm: bigLlm,
        git: new MockGitClient({
          files: { 'docs/spec-a.md': bigText('A'), 'docs/spec-b.md': bigText('B') },
        }),
      });
      const bigPr = await makePr();
      await generate(bigApp, bigPr.id);
      const big = await waitForIdle(bigApp, bigPr.id);
      expect(big.brief).not.toBeNull();

      const messages = bigLlm.structuredCalls()[0]!.messages;
      const tokenizer = new TiktokenTokenizer();
      const total = messages.reduce((n, m) => n + tokenizer.count(m.content), 0);
      expect(total).toBeLessThanOrEqual(8000);
      const specOmissions = big.omitted_inputs.filter((o: { kind: string }) => o.kind === 'spec');
      expect(specOmissions.length).toBeGreaterThan(0);
      expect(specOmissions[0].ref).toMatch(/^docs\/spec-[ab]\.md$/);
      await bigApp.close();
    } finally {
      await pg.handle.db.delete(t.agents).where(inArray(t.agents.id, [disabledAgent!.id, enabledAgent!.id]));
      await pg.handle.db.delete(t.skills).where(eq(t.skills.id, skill!.id));
    }
  });

  it('a second POST while one runs is 409 with one model call; GET shows generating (AC-22, AC-23)', async () => {
    const llm = newLlm();
    let release!: () => void;
    llm.script = () => new Promise<void>((resolve) => (release = resolve));
    const app = await makeApp({ llm });
    const pr = await makePr();

    expect((await generate(app, pr.id)).statusCode).toBe(202);
    await waitForStarted(llm);
    const second = await generate(app, pr.id);
    expect(second.statusCode).toBe(409);
    expect(second.json().error.code).toBe('conflict');
    expect(llm.started).toBe(1);
    expect((await getState(app, pr.id)).generating).toBe(true);

    release();
    const state = await waitForIdle(app, pr.id);
    expect(state.brief).not.toBeNull();
    expect(llm.started).toBe(1);
    await app.close();
  });

  it('a failed regeneration keeps the stored brief and reports the reason (AC-11, AC-12)', async () => {
    const llm = newLlm();
    const app = await makeApp({ llm });
    const pr = await makePr();
    await generate(app, pr.id);
    const first = await waitForIdle(app, pr.id);
    expect(first.brief).not.toBeNull();
    expect(llm.started).toBe(1);

    llm.script = async () => {
      throw new Error('Response failed schema validation after 1 attempt');
    };
    expect((await generate(app, pr.id)).statusCode).toBe(202);
    const failed = await waitForIdle(app, pr.id);
    expect(failed.last_error).toBe('output failed validation');
    expect(failed.brief).toEqual(first.brief);
    expect(failed.generated_at).toBe(first.generated_at);
    // Exactly one more attempt: no reprompt.
    expect(llm.started).toBe(2);

    // A new start clears the old reason.
    llm.script = undefined;
    const restarted = await generate(app, pr.id);
    expect(restarted.json().last_error).toBeNull();
    await waitForIdle(app, pr.id);
    await app.close();
  });

  it('a generation past its deadline fails with "timed out" and stores nothing (AC-12)', async () => {
    const llm = newLlm();
    llm.script = () => new Promise<void>(() => undefined);
    const app = await makeApp({ llm });
    const pr = await makePr();
    const service = new BriefService(app.container, { timeoutMs: 50 });

    const started = await service.startGeneration(workspaceId, pr.id, noopLog);
    expect(started.generating).toBe(true);
    await new Promise((r) => setTimeout(r, 400));

    const state = await service.getState(workspaceId, pr.id);
    expect(state).toMatchObject({ generating: false, last_error: 'timed out', brief: null });
    const rows = await pg.handle.db.select().from(t.prBrief).where(eq(t.prBrief.prId, pr.id));
    expect(rows).toHaveLength(0);
    await app.close();
  });

  it('a missing provider key is the failure reason (AC-12)', async () => {
    const app = await makeApp({ llmProviders: [] });
    const pr = await makePr();
    await generate(app, pr.id);
    const state = await waitForIdle(app, pr.id);
    expect(state.last_error).toContain('not configured');
    expect(state.brief).toBeNull();
    await app.close();
  });

  it('marks the brief stale when the head moves, keeping the brief (AC-19)', async () => {
    const app = await makeApp();
    const pr = await makePr();
    await generate(app, pr.id);
    const fresh = await waitForIdle(app, pr.id);
    expect(fresh.stale).toBe(false);

    await pg.handle.db
      .update(t.pullRequests)
      .set({ headSha: 'e'.repeat(12) })
      .where(eq(t.pullRequests.id, pr.id));
    const stale = await getState(app, pr.id);
    expect(stale.stale).toBe(true);
    expect(stale.brief).toEqual(fresh.brief);
    expect(stale.head_sha).toBe(HEAD);
    await app.close();
  });

  it('a PR with no changed files is 409 no_changed_files before any model call (AC-29)', async () => {
    const llm = newLlm();
    const app = await makeApp({ llm });
    const pr = await makePr({ files: false });
    const res = await generate(app, pr.id);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('no_changed_files');
    expect(llm.started).toBe(0);
    expect((await getState(app, pr.id)).generating).toBe(false);
    await app.close();
  });

  it("answers 404 for another workspace's PR (AC-26)", async () => {
    const db = pg.handle.db;
    const [wsB] = await db.insert(t.workspaces).values({ name: 'Workspace B' }).returning();
    const [repoB] = await db
      .insert(t.repos)
      .values({ workspaceId: wsB!.id, owner: 'other', name: 'wsb-brief', fullName: 'other/wsb-brief' })
      .returning();
    const prB = await makePr({ workspace: wsB!.id, repo: repoB!.id, withFinding: false });

    const llm = newLlm();
    const app = await makeApp({ llm });
    expect((await app.inject({ method: 'GET', url: `/pulls/${prB.id}/brief` })).statusCode).toBe(404);
    expect((await generate(app, prB.id)).statusCode).toBe(404);
    expect((await generate(app, randomUUID())).statusCode).toBe(404);
    expect(llm.started).toBe(0);
    await app.close();
  });

  it('rate limits POST to 10 per minute with rate limiting active (AC-25)', async () => {
    const llm = newLlm();
    let release!: () => void;
    llm.script = () => new Promise<void>((resolve) => (release = resolve));
    const base = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    const app = await makeApp({ llm, config: { ...base, nodeEnv: 'development', logLevel: 'silent' } });
    const pr = await makePr();

    const statuses: number[] = [];
    for (let i = 0; i < 11; i += 1) statuses.push((await generate(app, pr.id)).statusCode);
    expect(statuses[0]).toBe(202);
    expect(statuses.slice(1, 10).every((s) => s === 409)).toBe(true);
    expect(statuses[10]).toBe(429);
    expect(llm.started).toBe(1);

    release();
    await waitForIdle(app, pr.id);
    await app.close();
  });
  // ---- Gap-filling cases (audit of specs/03-pr-brief.md against the cases above) ----

  it('serves the seeded brief of PR #482 on GET with no model call (AC-9)', async () => {
    const [seeded] = await pg.handle.db.select().from(t.pullRequests).where(eq(t.pullRequests.number, 482));
    const llm = newLlm();
    const app = await makeApp({ llm });

    const state = await getState(app, seeded!.id);
    expect(state).toMatchObject({
      generating: false,
      stale: false,
      last_error: null,
      head_sha: 'a1b2c3d4e5f6',
      provider: 'openai',
      model: 'gpt-4.1',
      tokens_in: 8200,
      tokens_out: 1300,
      cost_usd: 0.014,
      unavailable_inputs: [{ kind: 'intent', ref: null }],
      omitted_inputs: [],
    });
    expect(state.brief.review_focus[0]).toMatchObject({ file: 'src/config.ts', line: 12 });
    expect(llm.calls).toHaveLength(0);
    await app.close();
  });

  it('shows the stored brief after a restart: a fresh app instance serves it with no call (AC-9)', async () => {
    const first = await makeApp();
    const pr = await makePr();
    await generate(first, pr.id);
    const stored = await waitForIdle(first, pr.id);
    await first.close();

    const llm = newLlm();
    const reloaded = await makeApp({ llm });
    const state = await getState(reloaded, pr.id);
    expect(state.brief).toEqual(stored.brief);
    expect(state).toMatchObject({ generating: false, stale: false, head_sha: HEAD });
    expect(llm.started).toBe(0);
    await reloaded.close();
  });

  it('two parallel POSTs start exactly one generation and one model call (AC-23)', async () => {
    const llm = newLlm();
    let release!: () => void;
    llm.script = () => new Promise<void>((resolve) => (release = resolve));
    const app = await makeApp({ llm });
    const pr = await makePr();

    const [a, b] = await Promise.all([generate(app, pr.id), generate(app, pr.id)]);
    expect([a.statusCode, b.statusCode].sort()).toEqual([202, 409]);
    await waitForStarted(llm);
    expect(llm.started).toBe(1);

    release();
    await waitForIdle(app, pr.id);
    expect(llm.started).toBe(1);
    await app.close();
  });

  it('reports a provider failure with its message and stores nothing when there was no brief (AC-12)', async () => {
    const llm = newLlm();
    llm.script = async () => {
      throw new Error('upstream 503');
    };
    const app = await makeApp({ llm });
    const pr = await makePr();

    await generate(app, pr.id);
    const state = await waitForIdle(app, pr.id);
    expect(state.last_error).toMatch(/^provider error: .*upstream 503/);
    expect(state.brief).toBeNull();
    expect(state.generating).toBe(false);
    expect(llm.started).toBe(1);
    const rows = await pg.handle.db.select().from(t.prBrief).where(eq(t.prBrief.prId, pr.id));
    expect(rows).toHaveLength(0);
    await app.close();
  });

  it('fails with the budget reason and makes no model call when the facts cannot be trimmed enough (AC-14)', async () => {
    // One caller is the last list entry that can be kept, so a huge symbol name cannot be cut away.
    const huge = randomBytes(30_000).toString('hex');
    const intel = makeIntel({
      ...BLAST,
      callers: [{ file: 'src/caller.ts', symbol: huge, viaSymbol: 'loadConfig', line: 3, rank: 1 }],
    });
    const llm = newLlm();
    const app = await makeApp({ llm, intel });
    const pr = await makePr();

    await generate(app, pr.id);
    const state = await waitForIdle(app, pr.id);
    expect(state.last_error).toBe('input exceeds the 8,000-token budget');
    expect(state.brief).toBeNull();
    expect(llm.started).toBe(0);
    await app.close();
  });

  it('keeps the diff text out of the model input (AC-16)', async () => {
    const llm = newLlm();
    const app = await makeApp({ llm });
    const pr = await makePr();
    await pg.handle.db
      .update(t.prFiles)
      .set({ patch: '@@ -1,1 +1,2 @@\n ctx\n+SENTINEL_PATCH_BODY_77 = secretValue()' })
      .where(eq(t.prFiles.prId, pr.id));

    await generate(app, pr.id);
    await waitForIdle(app, pr.id);
    const sent = JSON.stringify(llm.structuredCalls()[0]!.messages);
    expect(sent).toContain('src/config.ts');
    expect(sent).not.toContain('SENTINEL_PATCH_BODY_77');
    await app.close();
  });

  it('sends only open findings of the latest review, and starts no review, intent or run (AC-11)', async () => {
    const llm = newLlm();
    const app = await makeApp({ llm });
    const pr = await makePr(); // its older review holds the finding titled "Hardcoded key"
    await new Promise((r) => setTimeout(r, 15));
    const [newer] = await pg.handle.db
      .insert(t.reviews)
      .values({ workspaceId, prId: pr.id, agentId: null, kind: 'review', verdict: 'comment', summary: 's', score: 80, model: 'seed' })
      .returning();
    await pg.handle.db.insert(t.findings).values([
      { reviewId: newer!.id, file: 'src/api/users.ts', startLine: 45, endLine: 45, severity: 'WARNING', category: 'perf', title: 'NEWER_OPEN_FINDING', rationale: 'r', confidence: 0.8 },
      { reviewId: newer!.id, file: 'src/api/users.ts', startLine: 46, endLine: 46, severity: 'WARNING', category: 'perf', title: 'DISMISSED_FINDING', rationale: 'r', confidence: 0.8, dismissedAt: new Date() },
    ]);
    const before = {
      reviews: (await pg.handle.db.select().from(t.reviews)).length,
      runs: (await pg.handle.db.select().from(t.agentRuns)).length,
      intents: (await pg.handle.db.select().from(t.prIntent)).length,
    };

    await generate(app, pr.id);
    await waitForIdle(app, pr.id);

    const sent = JSON.stringify(llm.structuredCalls()[0]!.messages);
    expect(sent).toContain('NEWER_OPEN_FINDING');
    expect(sent).not.toContain('DISMISSED_FINDING');
    expect(sent).not.toContain('Hardcoded key');
    expect({
      reviews: (await pg.handle.db.select().from(t.reviews)).length,
      runs: (await pg.handle.db.select().from(t.agentRuns)).length,
      intents: (await pg.handle.db.select().from(t.prIntent)).length,
    }).toEqual(before);
    expect(llm.structuredCalls()).toHaveLength(1);
    await app.close();
  });

  it('counts a derived intent, a readable issue and a partial index as available inputs (AC-6)', async () => {
    const llm = newLlm();
    const app = await makeApp({ llm, intel: makeIntel(BLAST, 'partial') });
    const pr = await makePr({ body: 'Fixes #12' });
    await pg.handle.db.insert(t.prIntent).values({
      prId: pr.id,
      intent: 'INTENT_MARKER_TEXT',
      inScope: ['limiter'],
      outOfScope: [],
      confidence: 'high',
      headSha: 'c'.repeat(12), // an older head: a stale intent still counts
    });

    await generate(app, pr.id);
    const state = await waitForIdle(app, pr.id);

    // Only the specs are missing here (none attached); everything else was usable.
    expect(state.unavailable_inputs).toEqual([{ kind: 'specs', ref: null }]);
    const sent = JSON.stringify(llm.structuredCalls()[0]!.messages);
    expect(sent).toContain('INTENT_MARKER_TEXT');
    expect(sent).toContain('Issue #12');
    expect(sent).toContain('blast-radius');
    await app.close();
  });

  it('names an attached spec that cannot be read (AC-6)', async () => {
    const [agent] = await pg.handle.db
      .insert(t.agents)
      .values({
        workspaceId,
        name: `brief-missing-${randomUUID().slice(0, 6)}`,
        provider: 'openai',
        model: 'm',
        systemPrompt: 'p',
        contextPaths: ['docs/gone.md', 'docs/present.md'],
      })
      .returning();
    try {
      const llm = newLlm();
      const app = await makeApp({ llm, git: new MockGitClient({ files: { 'docs/present.md': '# Present\nPRESENT_SPEC_TEXT' } }) });
      const pr = await makePr();
      await generate(app, pr.id);
      const state = await waitForIdle(app, pr.id);

      expect(state.brief).not.toBeNull();
      expect(state.unavailable_inputs).toContainEqual({ kind: 'specs', ref: 'docs/gone.md' });
      expect(state.unavailable_inputs).not.toContainEqual({ kind: 'specs', ref: null });
      expect(JSON.stringify(llm.structuredCalls()[0]!.messages)).toContain('PRESENT_SPEC_TEXT');
      await app.close();
    } finally {
      await pg.handle.db.delete(t.agents).where(eq(t.agents.id, agent!.id));
    }
  });

  it('still generates, naming the blast radius as unavailable, when the index read throws (AC-6)', async () => {
    const intel = {
      ...makeIntel(),
      getBlastRadius: async () => {
        throw new Error('index exploded');
      },
    } as unknown as RepoIntel;
    const llm = newLlm();
    const app = await makeApp({ llm, intel });
    const pr = await makePr();

    await generate(app, pr.id);
    const state = await waitForIdle(app, pr.id);

    expect(state.last_error).toBeNull();
    expect(state.brief).not.toBeNull();
    expect(state.unavailable_inputs).toContainEqual({ kind: 'blast_radius', ref: null });
    expect(llm.started).toBe(1);
    await app.close();
  });

  it('records an unknown cost as null (AC-24)', async () => {
    class UnpricedLLM extends ScriptedLLM {
      async completeStructured<T>(req: StructuredRequest<T>) {
        return { ...(await super.completeStructured(req)), costUsd: null };
      }
    }
    const llm = new UnpricedLLM('openai', { structuredBySchema: { PrBriefGeneration: FIXTURE } });
    const app = await makeApp({ llm });
    const pr = await makePr();

    await generate(app, pr.id);
    const state = await waitForIdle(app, pr.id);
    expect(state).toMatchObject({ cost_usd: null, tokens_in: 100, tokens_out: 50, last_error: null });
    expect(state.brief).not.toBeNull();
    await app.close();
  });

  it('a regeneration after the head moved replaces the stale brief with one for the new head (AC-19)', async () => {
    const llm = newLlm();
    const app = await makeApp({ llm });
    const pr = await makePr();
    await generate(app, pr.id);
    await waitForIdle(app, pr.id);

    const newHead = 'f'.repeat(12);
    await pg.handle.db.update(t.pullRequests).set({ headSha: newHead }).where(eq(t.pullRequests.id, pr.id));
    expect((await getState(app, pr.id)).stale).toBe(true);
    expect(llm.started).toBe(1); // marking stale is a read: no call

    expect((await generate(app, pr.id)).statusCode).toBe(202);
    const fresh = await waitForIdle(app, pr.id);
    expect(fresh).toMatchObject({ stale: false, head_sha: newHead, last_error: null });
    expect(llm.started).toBe(2);
    await app.close();
  });
});
