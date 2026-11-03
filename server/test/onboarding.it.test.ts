import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
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
import { OnboardingService } from '../src/modules/onboarding/service.js';
import type { IndexState, RepoIntel } from '../src/modules/repo-intel/types.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[onboarding] Docker not available — skipping integration tests.');
}

const INDEXED_SHA = 'c'.repeat(40);

const FILES: Record<string, string> = {
  'README.md': '# Widgets\nRun with pnpm dev.',
  'package.json': '{"scripts":{"dev":"tsx src/server.ts"}}',
  'docker-compose.yml': 'services:\n  db:\n    image: postgres',
  '.env': 'SECRET_LIVE_TOKEN=abc',
  '.env.local': 'LOCAL_ONLY=1',
  '.env.example': 'EXAMPLE_KEY=changeme',
  'certs/server.pem': '-----BEGIN PRIVATE KEY-----\nPRIVATE-KEY-BODY\n-----END PRIVATE KEY-----',
  'node_modules/x/index.js': 'module.exports = 1;',
  'src/server.ts': 'export const server = 1;',
  'src/auth.ts': 'export const auth = 1;',
  'src/db.ts': 'export const db = 1;',
  'src/extra.ts': 'export const extra = 1;',
  'src/a.test.ts': 'test("a", () => {});',
  'vitest.config.ts': 'export default {};',
  'db/migrations/0001_x.ts': 'export const up = 1;',
  'dist/out.js': 'var x = 1;',
};

const CHAINS = [
  ['src/server.ts', 'src/auth.ts', 'src/a.test.ts', 'vitest.config.ts'],
  ['src/db.ts', 'db/migrations/0001_x.ts', 'dist/out.js', 'src/ghost.ts'],
];
const RANKED = ['src/db.ts', 'src/server.ts', 'src/auth.ts'];

const GOOD_STATE: IndexState = {
  repoId: '',
  status: 'partial',
  filesIndexed: 42,
  filesSkipped: 0,
  durationMs: 1,
  lastIndexedSha: INDEXED_SHA,
  indexerVersion: 2,
  updatedAt: new Date(0),
};

const NO_DATA_STATE: IndexState = {
  ...GOOD_STATE,
  status: 'degraded',
  filesIndexed: 0,
  lastIndexedSha: '',
  degraded: true,
  degradedReason: 'no_data',
};

interface Intel {
  state: IndexState;
  chains: string[][];
  ranked: string[];
}

function makeIntel(over: Partial<Intel> = {}): Intel & RepoIntel {
  const intel: Intel = { state: GOOD_STATE, chains: CHAINS, ranked: RANKED, ...over };
  return {
    ...intel,
    getIndexState: async () => intel.state,
    getCriticalPaths: async () => intel.chains,
    getTopFilesByRank: async () => intel.ranked,
  } as unknown as Intel & RepoIntel;
}

const FIXTURE = {
  architecture: {
    summary_md: 'The `src/server.ts` boots everything.',
    diagram: null,
    links: [
      { label: 'Server', path: 'src/server.ts' },
      { label: 'Missing', path: 'src/nope.ts' },
    ],
  },
  critical_notes: [
    { path: 'src/server.ts', note: 'Boots the app' },
    { path: 'src/auth.ts', note: 'Validates tokens' },
    { path: 'src/extra.ts', note: 'Not an index-chosen file' },
  ],
  reading_reasons: [{ path: 'src/server.ts', reason: 'Start here' }],
  run_steps: [{ command: 'pnpm install' }, { command: 'pnpm dev # http://localhost:3000' }],
  first_tasks: [
    { title: 'Ghost task', description: 'names a missing file', paths: ['src/ghost.ts'] },
    { title: 'Real task', description: 'names real files', paths: ['src/server.ts', 'src/auth.ts'] },
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
    return this.calls.filter((c) => c.method === 'completeStructured').map((c) => c.req as StructuredRequest<unknown>);
  }
}

class NoMirrorGit extends MockGitClient {
  async currentHead(): Promise<string> {
    throw new Error('no mirror');
  }
}

const silentLog = { info: () => undefined, warn: () => undefined };

d('onboarding module (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    ({ workspaceId } = await seed(pg.handle.db));
    const app = await makeApp();
    await setOnboardingModel(app, 'openai', 'gpt-tour');
    await app.close();
  });
  afterAll(async () => {
    await pg?.stop();
  });

  async function makeRepo() {
    const suffix = randomUUID().slice(0, 8);
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: `widgets-${suffix}`, fullName: `acme/widgets-${suffix}` })
      .returning();
    return repo!;
  }

  async function makeApp(
    opts: {
      llm?: ScriptedLLM;
      intel?: RepoIntel;
      git?: MockGitClient;
      llmProviders?: ('openai' | 'openrouter')[];
    } = {},
  ) {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    const llm = opts.llm ?? new ScriptedLLM('openai', { structuredBySchema: { OnboardingTourGeneration: FIXTURE } });
    const providers = opts.llmProviders ?? ['openai', 'openrouter'];
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        git: opts.git ?? new MockGitClient({ files: FILES, head: INDEXED_SHA }),
        github: new MockGitHubClient(),
        secrets: new MockSecretsProvider({}),
        llm: Object.fromEntries(providers.map((p) => [p, llm])),
        repoIntel: opts.intel ?? makeIntel(),
      },
    });
  }

  async function setOnboardingModel(app: Awaited<ReturnType<typeof makeApp>>, provider: string, model: string) {
    const res = await app.inject({
      method: 'PUT',
      url: '/settings',
      payload: { feature_models: { onboarding: { provider, model } } },
    });
    expect(res.statusCode).toBe(200);
  }

  type App = Awaited<ReturnType<typeof makeApp>>;
  const getState = async (app: App, repoId: string) =>
    (await app.inject({ method: 'GET', url: `/repos/${repoId}/onboarding` })).json();
  const generate = (app: App, repoId: string) =>
    app.inject({ method: 'POST', url: `/repos/${repoId}/onboarding/generate` });

  async function waitForIdle(app: App, repoId: string) {
    for (let i = 0; i < 100; i += 1) {
      const state = await getState(app, repoId);
      if (!state.generating) return state;
      await new Promise((r) => setTimeout(r, 25));
    }
    throw new Error('generation did not finish');
  }

  it('GET on a new repo has no tour, a ready index and makes no LLM call (AC-5)', async () => {
    const llm = new ScriptedLLM('openai', { structuredBySchema: { OnboardingTourGeneration: FIXTURE } });
    const app = await makeApp({ llm });
    const repo = await makeRepo();

    const state = await getState(app, repo.id);
    expect(state).toMatchObject({
      repo_id: repo.id,
      tour: null,
      generating: false,
      last_error: null,
      index: { ready: true, reason: null, status: 'partial', indexed_sha: INDEXED_SHA, file_count: 42 },
    });
    expect(llm.calls).toHaveLength(0);
    await app.close();
  });

  it('generate: 202 + generating, exactly one capped call, a stored grounded tour, reads add no call', async () => {
    const llm = new ScriptedLLM('openai', { structuredBySchema: { OnboardingTourGeneration: FIXTURE } });
    const app = await makeApp({ llm });
    const repo = await makeRepo();

    const res = await generate(app, repo.id);
    expect(res.statusCode).toBe(202);
    expect(res.json().generating).toBe(true);

    const state = await waitForIdle(app, repo.id);
    const calls = llm.structuredCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ model: 'gpt-tour', maxRetries: 0 });
    expect(calls[0]!.timeoutMs).toBeLessThanOrEqual(120_000);

    await getState(app, repo.id);
    expect(llm.structuredCalls()).toHaveLength(1);

    const tour = state.tour;
    expect(state.last_error).toBeNull();
    // AC-9 / AC-11: index-chosen, filtered, in rank order.
    expect(tour.critical_paths.source).toBe('critical_paths');
    expect(tour.critical_paths.items.map((i: { path: string }) => i.path)).toEqual([
      'src/db.ts',
      'src/server.ts',
      'src/auth.ts',
    ]);
    expect(tour.critical_paths.items).toEqual([
      { path: 'src/db.ts', note: null },
      { path: 'src/server.ts', note: 'Boots the app' },
      { path: 'src/auth.ts', note: 'Validates tokens' },
    ]);
    // AC-10: reading path follows chain order.
    expect(tour.reading_path).toEqual([
      { path: 'src/server.ts', reason: 'Start here' },
      { path: 'src/auth.ts', reason: null },
      { path: 'src/db.ts', reason: null },
    ]);
    // AC-19 / AC-24 data.
    expect(tour).toMatchObject({ commit_sha: INDEXED_SHA, index_file_count: 42, index_status: 'partial' });
    // AC-17 / AC-18: ungrounded task and link are gone.
    expect(tour.first_tasks.map((x: { title: string }) => x.title)).toEqual(['Real task']);
    expect(tour.architecture.links).toEqual([{ label: 'Server', path: 'src/server.ts' }]);
    expect(tour.run_steps).toEqual(FIXTURE.run_steps);
    await app.close();
  });

  it('with no critical chains the tour falls back to file rank (AC-36)', async () => {
    const app = await makeApp({ intel: makeIntel({ chains: [] }) });
    const repo = await makeRepo();
    await generate(app, repo.id);
    const { tour } = await waitForIdle(app, repo.id);
    expect(tour.critical_paths.source).toBe('file_rank');
    expect(tour.critical_paths.items.map((i: { path: string }) => i.path)).toEqual(RANKED);
    await app.close();
  });

  it('never sends secret files to the model (AC-30)', async () => {
    const llm = new ScriptedLLM('openai', { structuredBySchema: { OnboardingTourGeneration: FIXTURE } });
    const app = await makeApp({ llm });
    const repo = await makeRepo();
    await generate(app, repo.id);
    await waitForIdle(app, repo.id);

    const sent = JSON.stringify(llm.structuredCalls()[0]!.messages);
    expect(sent).not.toContain('SECRET_LIVE_TOKEN');
    expect(sent).not.toContain('LOCAL_ONLY');
    expect(sent).not.toContain('PRIVATE-KEY-BODY');
    expect(sent).not.toContain('node_modules/x');
    expect(sent).toContain('EXAMPLE_KEY=changeme');
    expect(sent).toContain('Run with pnpm dev');
    await app.close();
  });

  it('two parallel POSTs: 202 and 409, one LLM call; GET shows generating while pending (AC-20, AC-21)', async () => {
    const llm = new ScriptedLLM('openai', { structuredBySchema: { OnboardingTourGeneration: FIXTURE } });
    let release!: () => void;
    llm.script = () => new Promise<void>((resolve) => (release = resolve));
    const app = await makeApp({ llm });
    const repo = await makeRepo();

    const results = await Promise.all([generate(app, repo.id), generate(app, repo.id)]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([202, 409]);

    // Wait for the single run to reach the model.
    for (let i = 0; i < 100 && llm.started === 0; i += 1) await new Promise((r) => setTimeout(r, 10));
    expect(llm.started).toBe(1);
    expect((await getState(app, repo.id)).generating).toBe(true);

    release();
    const state = await waitForIdle(app, repo.id);
    expect(state.tour).not.toBeNull();
    expect(llm.started).toBe(1);
    await app.close();
  });

  it('a failed regeneration keeps the stored tour and reports the reason (AC-22)', async () => {
    const llm = new ScriptedLLM('openai', { structuredBySchema: { OnboardingTourGeneration: FIXTURE } });
    const app = await makeApp({ llm });
    const repo = await makeRepo();
    await generate(app, repo.id);
    const first = await waitForIdle(app, repo.id);
    expect(first.tour).not.toBeNull();

    llm.script = async () => {
      throw new Error('boom');
    };
    expect((await generate(app, repo.id)).statusCode).toBe(202);
    const failed = await waitForIdle(app, repo.id);
    expect(failed.last_error).toBe('provider error: boom');
    expect(failed.tour).toEqual(first.tour);

    llm.script = async () => {
      throw new Error('Response failed schema validation after 1 attempt');
    };
    await generate(app, repo.id);
    expect((await waitForIdle(app, repo.id)).last_error).toBe('output failed validation');

    // A new start clears the old reason.
    llm.script = undefined;
    const restarted = await generate(app, repo.id);
    expect(restarted.json().last_error).toBeNull();
    await waitForIdle(app, repo.id);
    await app.close();
  });

  it('a missing provider key is the failure reason (AC-22)', async () => {
    const openai = new ScriptedLLM('openai', { structuredBySchema: { OnboardingTourGeneration: FIXTURE } });
    const app = await makeApp({ llm: openai, llmProviders: ['openai'] });
    const repo = await makeRepo();
    await setOnboardingModel(app, 'openrouter', 'some/model');
    try {
      await generate(app, repo.id);
      const state = await waitForIdle(app, repo.id);
      expect(state.last_error).toContain('OPENROUTER_API_KEY');
      expect(state.tour).toBeNull();
      expect(openai.calls).toHaveLength(0);
    } finally {
      await setOnboardingModel(app, 'openai', 'gpt-tour');
      await app.close();
    }
  });

  it('a generation past its deadline fails with "timed out" and stores nothing (AC-32)', async () => {
    const llm = new ScriptedLLM('openai', { structuredBySchema: { OnboardingTourGeneration: FIXTURE } });
    let release!: () => void;
    llm.script = () => new Promise<void>((resolve) => (release = resolve));
    const app = await makeApp({ llm });
    const repo = await makeRepo();
    const service = new OnboardingService(app.container, { timeoutMs: 200 });

    const started = await service.startGeneration(workspaceId, repo.id, silentLog);
    expect(started.generating).toBe(true);

    await new Promise((r) => setTimeout(r, 500));
    const timedOut = await service.getState(workspaceId, repo.id);
    expect(timedOut).toMatchObject({ generating: false, last_error: 'timed out', tour: null });

    // The model answers after the deadline: the late result is discarded.
    release();
    await new Promise((r) => setTimeout(r, 200));
    const rows = await pg.handle.db.select().from(t.onboarding).where(eq(t.onboarding.repoId, repo.id));
    expect(rows).toHaveLength(0);
    expect((await service.getState(workspaceId, repo.id))?.tour).toBeNull();
    await app.close();
  });

  it('an index with no data blocks generation with 409 repo_not_indexed (AC-23)', async () => {
    const llm = new ScriptedLLM('openai', { structuredBySchema: { OnboardingTourGeneration: FIXTURE } });
    const app = await makeApp({ llm, intel: makeIntel({ state: NO_DATA_STATE }) });
    const repo = await makeRepo();

    expect((await getState(app, repo.id)).index).toMatchObject({
      ready: false,
      reason: 'no_data',
      status: null,
      indexed_sha: null,
    });
    const res = await generate(app, repo.id);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('repo_not_indexed');
    expect(llm.calls).toHaveLength(0);
    // The refusal does not leave the repo stuck in "generating".
    expect((await getState(app, repo.id)).generating).toBe(false);
    await app.close();
  });

  it('a failed index reports index_failed (AC-23)', async () => {
    const app = await makeApp({ intel: makeIntel({ state: { ...GOOD_STATE, status: 'failed' } }) });
    const repo = await makeRepo();
    expect((await getState(app, repo.id)).index).toMatchObject({ ready: false, reason: 'index_failed' });
    await app.close();
  });

  it('a missing mirror reports no_mirror and blocks generation (AC-23)', async () => {
    const llm = new ScriptedLLM('openai', { structuredBySchema: { OnboardingTourGeneration: FIXTURE } });
    const app = await makeApp({ llm, git: new NoMirrorGit({ files: FILES }) });
    const repo = await makeRepo();
    expect((await getState(app, repo.id)).index).toMatchObject({ ready: false, reason: 'no_mirror' });
    expect((await generate(app, repo.id)).statusCode).toBe(409);
    expect(llm.calls).toHaveLength(0);
    await app.close();
  });

  it('returns 404 for a repo that is not in the workspace', async () => {
    const app = await makeApp();
    const id = randomUUID();
    expect((await app.inject({ method: 'GET', url: `/repos/${id}/onboarding` })).statusCode).toBe(404);
    expect((await generate(app, id)).statusCode).toBe(404);
    await app.close();
  });
});
