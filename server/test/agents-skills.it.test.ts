import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[agents-skills] Docker not available — skipping integration tests.');
}

d('PUT/GET /agents/:id/skills (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    ({ workspaceId } = await seed(pg.handle.db));
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp() {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient() },
    });
  }

  async function newAgent(app: Awaited<ReturnType<typeof makeApp>>, name: string) {
    const res = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: { name, provider: 'openai', model: 'gpt-4.1', system_prompt: 'review' },
    });
    return res.json().id as string;
  }
  async function newSkill(app: Awaited<ReturnType<typeof makeApp>>, name: string) {
    const res = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { name, description: 'd', type: 'rubric', body: 'body' },
    });
    return res.json().id as string;
  }

  it('replaces the ordered set in one shot, bumps the agent version and snapshots [{skill_id, version, enabled}]', async () => {
    const app = await makeApp();
    const agentId = await newAgent(app, 'Link Agent');
    const a = await newSkill(app, 'link-a');
    const b = await newSkill(app, 'link-b');
    const c = await newSkill(app, 'link-c');

    const put = await app.inject({
      method: 'PUT',
      url: `/agents/${agentId}/skills`,
      payload: { items: [{ skill_id: b, enabled: true }, { skill_id: a, enabled: false }, { skill_id: c, enabled: true }] },
    });
    expect(put.statusCode).toBe(200);
    expect(put.json().map((l: { skill: { id: string }; order: number; enabled: boolean }) => [l.skill.id, l.order, l.enabled])).toEqual([
      [b, 0, true], [a, 1, false], [c, 2, true],
    ]);

    const agent = (await app.inject({ method: 'GET', url: `/agents/${agentId}` })).json();
    expect(agent.version).toBe(2);
    expect(agent.skill_count).toBe(2); // a is disabled for this agent

    const v2 = (await app.inject({ method: 'GET', url: `/agents/${agentId}/versions/2` })).json();
    expect(v2.config.skills).toEqual([
      { skill_id: b, version: 1, enabled: true },
      { skill_id: a, version: 1, enabled: false },
      { skill_id: c, version: 1, enabled: true },
    ]);

    // reorder + toggle → another bump
    const put2 = await app.inject({
      method: 'PUT',
      url: `/agents/${agentId}/skills`,
      payload: { items: [{ skill_id: a, enabled: true }, { skill_id: b, enabled: true }] },
    });
    expect(put2.statusCode).toBe(200);
    expect(put2.json()).toHaveLength(2);
    expect((await app.inject({ method: 'GET', url: `/agents/${agentId}` })).json().version).toBe(3);

    // identical set → no-op, no bump
    await app.inject({
      method: 'PUT',
      url: `/agents/${agentId}/skills`,
      payload: { items: [{ skill_id: a, enabled: true }, { skill_id: b, enabled: true }] },
    });
    expect((await app.inject({ method: 'GET', url: `/agents/${agentId}` })).json().version).toBe(3);

    // a skill's own version shows up in later snapshots
    await app.inject({ method: 'PUT', url: `/skills/${a}`, payload: { body: 'changed' } });
    await app.inject({ method: 'PUT', url: `/agents/${agentId}/skills`, payload: { items: [{ skill_id: a, enabled: true }] } });
    const v4 = (await app.inject({ method: 'GET', url: `/agents/${agentId}/versions/4` })).json();
    expect(v4.config.skills).toEqual([{ skill_id: a, version: 2, enabled: true }]);

    // empty set unlinks everything
    const cleared = await app.inject({ method: 'PUT', url: `/agents/${agentId}/skills`, payload: { items: [] } });
    expect(cleared.json()).toEqual([]);
    expect((await app.inject({ method: 'GET', url: `/agents/${agentId}/skills` })).json()).toEqual([]);
    await app.close();
  });

  it('is atomic: an invalid item (422) leaves links and version untouched', async () => {
    const app = await makeApp();
    const agentId = await newAgent(app, 'Atomic Agent');
    const a = await newSkill(app, 'atomic-a');
    await app.inject({ method: 'PUT', url: `/agents/${agentId}/skills`, payload: { items: [{ skill_id: a, enabled: true }] } });
    const versionBefore = (await app.inject({ method: 'GET', url: `/agents/${agentId}` })).json().version;

    const bogus = '00000000-0000-4000-8000-000000000000';
    for (const items of [
      [{ skill_id: a, enabled: true }, { skill_id: bogus, enabled: true }],
      [{ skill_id: 'not-a-uuid', enabled: true }],
      [{ skill_id: a, enabled: true }, { skill_id: a, enabled: false }],
    ]) {
      const res = await app.inject({ method: 'PUT', url: `/agents/${agentId}/skills`, payload: { items } });
      expect(res.statusCode).toBe(422);
    }
    const links = (await app.inject({ method: 'GET', url: `/agents/${agentId}/skills` })).json();
    expect(links.map((l: { skill: { id: string } }) => l.skill.id)).toEqual([a]);
    expect((await app.inject({ method: 'GET', url: `/agents/${agentId}` })).json().version).toBe(versionBefore);
    await app.close();
  });

  it('workspace isolation: other-workspace skills → 422; other-workspace agent → 404', async () => {
    const db = pg.handle.db;
    const [other] = await db.insert(t.workspaces).values({ name: 'agents-skills-other' }).returning();
    const [foreignSkill] = await db
      .insert(t.skills)
      .values({ workspaceId: other!.id, name: 'foreign', description: 'd', type: 'custom', source: 'manual', body: 'b' })
      .returning();
    const [foreignAgent] = await db
      .insert(t.agents)
      .values({ workspaceId: other!.id, name: 'Foreign Agent', provider: 'openai', model: 'm', systemPrompt: 's' })
      .returning();

    const app = await makeApp();
    const agentId = await newAgent(app, 'Iso Agent');
    const res = await app.inject({
      method: 'PUT',
      url: `/agents/${agentId}/skills`,
      payload: { items: [{ skill_id: foreignSkill!.id, enabled: true }] },
    });
    expect(res.statusCode).toBe(422);
    expect((await app.inject({ method: 'PUT', url: `/agents/${agentId}/skills`, payload: { items: [] } })).statusCode).toBe(200);

    expect((await app.inject({ method: 'GET', url: `/agents/${foreignAgent!.id}/skills` })).statusCode).toBe(404);
    expect(
      (await app.inject({ method: 'PUT', url: `/agents/${foreignAgent!.id}/skills`, payload: { items: [] } })).statusCode,
    ).toBe(404);
    // legacy POST also refuses foreign skills
    expect(
      (await app.inject({ method: 'POST', url: `/agents/${agentId}/skills`, payload: { skill_id: foreignSkill!.id } })).statusCode,
    ).toBe(422);
    await app.close();
  });

  it('legacy POST keeps working: link-one and set-by-ids are transactional and bump the version', async () => {
    const app = await makeApp();
    const agentId = await newAgent(app, 'Legacy Agent');
    const a = await newSkill(app, 'legacy-a');
    const b = await newSkill(app, 'legacy-b');

    const one = await app.inject({ method: 'POST', url: `/agents/${agentId}/skills`, payload: { skill_id: a } });
    expect(one.statusCode).toBe(200);
    expect(one.json()).toEqual([{ agent_id: agentId, skill_id: a, order: 0 }]);
    expect((await app.inject({ method: 'GET', url: `/agents/${agentId}` })).json().version).toBe(2);

    // re-linking at the same position is idempotent (no bump)
    await app.inject({ method: 'POST', url: `/agents/${agentId}/skills`, payload: { skill_id: a } });
    expect((await app.inject({ method: 'GET', url: `/agents/${agentId}` })).json().version).toBe(2);

    // toggle a off per-agent, then set-by-ids keeps its flag
    await app.inject({ method: 'PUT', url: `/agents/${agentId}/skills`, payload: { items: [{ skill_id: a, enabled: false }] } });
    const set = await app.inject({ method: 'POST', url: `/agents/${agentId}/skills`, payload: { skill_ids: [b, a] } });
    expect(set.json().map((l: { skill_id: string }) => l.skill_id)).toEqual([b, a]);
    const links = (await app.inject({ method: 'GET', url: `/agents/${agentId}/skills` })).json();
    expect(links.map((l: { enabled: boolean }) => l.enabled)).toEqual([true, false]);
    await app.close();
  });

  it('old agent_versions snapshots (skills: string[]) still read through the API', async () => {
    const db = pg.handle.db;
    const app = await makeApp();
    const agentId = await newAgent(app, 'Legacy Snapshot Agent');
    await db.insert(t.agentVersions).values({
      agentId,
      version: 50,
      configJson: {
        provider: 'openai', model: 'm', system_prompt: 's', output_schema: null,
        strategy: 'single-pass', ci_fail_on: 'critical', repo_intel: true,
        skills: ['11111111-1111-4111-8111-111111111111'],
      },
    });
    const res = await app.inject({ method: 'GET', url: `/agents/${agentId}/versions/50` });
    expect(res.statusCode).toBe(200);
    expect(res.json().config.skills).toEqual([
      { skill_id: '11111111-1111-4111-8111-111111111111', version: 1, enabled: true },
    ]);
    await db.delete(t.agentVersions).where(eq(t.agentVersions.version, 50));
    await app.close();
    void workspaceId;
  });

  it('skill_count on GET /agents ignores globally-disabled skills', async () => {
    const app = await makeApp();
    const agentId = await newAgent(app, 'Count Agent');
    const a = await newSkill(app, 'count-a');
    const b = await newSkill(app, 'count-b');
    await app.inject({
      method: 'PUT',
      url: `/agents/${agentId}/skills`,
      payload: { items: [{ skill_id: a, enabled: true }, { skill_id: b, enabled: true }] },
    });
    const count = async () =>
      (await app.inject({ method: 'GET', url: '/agents' })).json().find((x: { id: string }) => x.id === agentId).skill_count;
    expect(await count()).toBe(2);
    await app.inject({ method: 'PUT', url: `/skills/${b}`, payload: { enabled: false } });
    expect(await count()).toBe(1);
    await app.close();
  });
});
