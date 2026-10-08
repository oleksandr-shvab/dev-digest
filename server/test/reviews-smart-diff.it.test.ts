import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { SmartDiffResponse } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient, MockLLMProvider } from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[integration] Docker not available — skipping reviews-smart-diff.it.test.ts.');
}

/** GET /pulls/:id/smart-diff against the seeded PR #482 (4 core files, 2 findings, no patches). */
d('GET /pulls/:id/smart-diff (Testcontainers pg)', () => {
  let pg: PgFixture;
  let prId: string;
  const llmMock = new MockLLMProvider('openai');

  const app = () =>
    buildApp({
      config: loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv),
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient(),
        github: new MockGitHubClient(),
        llm: { openai: llmMock },
      },
    });

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [pr] = await pg.handle.db
      .select()
      .from(t.pullRequests)
      .where(eq(t.pullRequests.number, 482));
    prId = pr!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('groups the seeded PR by role, marks the finding lines and makes no model call', async () => {
    const a = await app();
    const res = await a.inject({ method: 'GET', url: `/pulls/${prId}/smart-diff` });
    expect(res.statusCode).toBe(200);

    const body = SmartDiffResponse.parse(res.json());
    expect(body.groups.map((g) => g.role)).toEqual(['core', 'tests', 'wiring', 'docs', 'boilerplate']);

    const [core, ...others] = body.groups;
    expect(core!.files.map((f) => f.path).sort()).toEqual([
      'src/api/public/webhooks.ts',
      'src/api/users.ts',
      'src/config.ts',
      'src/middleware/ratelimit.ts',
    ]);
    const lines = (path: string) => core!.files.find((f) => f.path === path)!.finding_lines;
    expect(lines('src/config.ts')).toEqual([12]);
    expect(lines('src/api/users.ts')).toEqual([45]);
    expect(others.every((g) => g.files.length === 0)).toBe(true);
    expect(body.split_suggestion).toEqual({ too_big: false, total_lines: 134, proposed_splits: [] });
    expect(llmMock.calls).toEqual([]);
    await a.close();
  });

  it('drops a dismissed finding from finding_lines', async () => {
    await pg.handle.db
      .update(t.findings)
      .set({ dismissedAt: new Date() })
      .where(eq(t.findings.file, 'src/api/users.ts'));

    const a = await app();
    const res = await a.inject({ method: 'GET', url: `/pulls/${prId}/smart-diff` });
    const core = SmartDiffResponse.parse(res.json()).groups[0]!;
    expect(core.files.find((f) => f.path === 'src/api/users.ts')!.finding_lines).toEqual([]);
    expect(core.files.find((f) => f.path === 'src/config.ts')!.finding_lines).toEqual([12]);
    await a.close();
  });

  it('404 for an unknown PR, 422 for a non-uuid id', async () => {
    const a = await app();
    const unknown = await a.inject({
      method: 'GET',
      url: '/pulls/00000000-0000-4000-8000-000000000000/smart-diff',
    });
    expect(unknown.statusCode).toBe(404);

    const bad = await a.inject({ method: 'GET', url: '/pulls/not-a-uuid/smart-diff' });
    expect(bad.statusCode).toBe(422);
    await a.close();
  });
});
