import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildMultipart, buildZip } from './helpers/zip.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[skills] Docker not available — skipping integration tests.');
}

const SKILL_MD = '---\nname: flaky-import\ndescription: Import me.\n---\n\n# Flaky\nBody text.\n';

d('skills module (Testcontainers pg)', () => {
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

  const base = (name: string) => ({
    name,
    description: 'A skill.',
    type: 'rubric' as const,
    body: 'Body v1',
  });

  it('seed: Test Quality Reviewer has its three skills linked in order, each at v1 "Initial version"; re-seed is idempotent', async () => {
    const db = pg.handle.db;
    await seed(db); // second run
    const [agent] = await db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, 'Test Quality Reviewer')));
    expect(agent).toBeDefined();

    const app = await makeApp();
    const links = (await app.inject({ method: 'GET', url: `/agents/${agent!.id}/skills` })).json();
    expect(links.map((l: { skill: { name: string } }) => l.skill.name)).toEqual([
      'uncovered-branches',
      'corner-cases',
      'over-mocking',
    ]);
    expect(links.map((l: { order: number }) => l.order)).toEqual([0, 1, 2]);
    expect(links.every((l: { skill: { type: string; version: number } }) => l.skill.type === 'rubric' && l.skill.version === 1)).toBe(true);

    const id = links[0].skill.id as string;
    const versions = (await app.inject({ method: 'GET', url: `/skills/${id}/versions` })).json();
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({ version: 1, message: 'Initial version', current: true });

    const all = await db.select().from(t.skills).where(eq(t.skills.workspaceId, workspaceId));
    expect(all.filter((s) => s.name === 'flaky-tests')).toHaveLength(0); // not seeded
    const list = (await app.inject({ method: 'GET', url: `/agents` })).json();
    expect(list.find((a: { id: string }) => a.id === agent!.id).skill_count).toBe(3);
    await app.close();
  });

  it('CRUD: create → 201 with v1; GET/list carry the stats summary; duplicate name → 409; delete', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'POST', url: '/skills', payload: base('crud-skill') });
    expect(res.statusCode).toBe(201);
    const skill = res.json();
    expect(skill).toMatchObject({
      name: 'crud-skill', version: 1, source: 'manual', enabled: true,
      stats: { used_by: 0, pull_rate: null, accept_rate: null },
    });
    expect(typeof skill.updated_at).toBe('string');

    const versions = (await app.inject({ method: 'GET', url: `/skills/${skill.id}/versions` })).json();
    expect(versions).toEqual([
      expect.objectContaining({ version: 1, message: 'Initial version', body: 'Body v1', current: true }),
    ]);

    const dup = await app.inject({ method: 'POST', url: '/skills', payload: base('crud-skill') });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error.code).toBe('conflict');

    const bad = await app.inject({ method: 'POST', url: '/skills', payload: { ...base('Not A Slug') } });
    expect(bad.statusCode).toBe(422);

    const got = await app.inject({ method: 'GET', url: `/skills/${skill.id}` });
    expect(got.json().stats).toBeDefined();
    const list = (await app.inject({ method: 'GET', url: '/skills' })).json();
    const names = list.map((s: { name: string }) => s.name);
    expect(names).toEqual([...names].sort());
    expect(list.find((s: { id: string }) => s.id === skill.id).stats).toBeDefined();

    const del = await app.inject({ method: 'DELETE', url: `/skills/${skill.id}` });
    expect(del.statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: `/skills/${skill.id}` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'DELETE', url: `/skills/${skill.id}` })).statusCode).toBe(404);
    await app.close();
  });

  it('imported_file source gets an "Imported from" default message', async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { ...base('imported-one'), source: 'imported_file' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().source).toBe('imported_file');
    const v = (await app.inject({ method: 'GET', url: `/skills/${res.json().id}/versions/1` })).json();
    expect(v.message).toMatch(/^Imported from/);
    await app.close();
  });

  it('versions: content edits bump with the message; rename/toggle do not; 409 on rename clash', async () => {
    const app = await makeApp();
    const id = (await app.inject({ method: 'POST', url: '/skills', payload: base('ver-skill') })).json().id;
    await app.inject({ method: 'POST', url: '/skills', payload: base('ver-other') });

    const edited = (
      await app.inject({ method: 'PUT', url: `/skills/${id}`, payload: { body: 'Body v2', message: 'tightened' } })
    ).json();
    expect(edited.version).toBe(2);
    expect(edited.body).toBe('Body v2');

    const noMsg = (await app.inject({ method: 'PUT', url: `/skills/${id}`, payload: { description: 'New desc' } })).json();
    expect(noMsg.version).toBe(3);

    // rename + toggle: no version
    const renamed = (await app.inject({ method: 'PUT', url: `/skills/${id}`, payload: { name: 'ver-skill-renamed', enabled: false } })).json();
    expect(renamed).toMatchObject({ version: 3, name: 'ver-skill-renamed', enabled: false });
    // identical content: no version
    const same = (await app.inject({ method: 'PUT', url: `/skills/${id}`, payload: { body: 'Body v2' } })).json();
    expect(same.version).toBe(3);

    const clash = await app.inject({ method: 'PUT', url: `/skills/${id}`, payload: { name: 'ver-other' } });
    expect(clash.statusCode).toBe(409);

    const versions = (await app.inject({ method: 'GET', url: `/skills/${id}/versions` })).json();
    expect(versions.map((v: { version: number }) => v.version)).toEqual([3, 2, 1]);
    expect(versions.map((v: { message: string }) => v.message)).toEqual(['Edited', 'tightened', 'Initial version']);
    expect(versions.map((v: { current: boolean }) => v.current)).toEqual([true, false, false]);
    expect(versions[2]).toMatchObject({ body: 'Body v1', description: 'A skill.', type: 'rubric' });

    const one = await app.inject({ method: 'GET', url: `/skills/${id}/versions/2` });
    expect(one.json()).toMatchObject({ version: 2, body: 'Body v2', message: 'tightened' });
    expect((await app.inject({ method: 'GET', url: `/skills/${id}/versions/99` })).statusCode).toBe(404);
    await app.close();
  });

  it('restore creates current+1 with the old content and keeps history', async () => {
    const app = await makeApp();
    const id = (await app.inject({ method: 'POST', url: '/skills', payload: base('restore-skill') })).json().id;
    await app.inject({ method: 'PUT', url: `/skills/${id}`, payload: { body: 'Body v2', type: 'security' } });

    const restored = await app.inject({ method: 'POST', url: `/skills/${id}/versions/1/restore` });
    expect(restored.statusCode).toBe(200);
    expect(restored.json()).toMatchObject({ version: 3, body: 'Body v1', type: 'rubric' });

    const versions = (await app.inject({ method: 'GET', url: `/skills/${id}/versions` })).json();
    expect(versions).toHaveLength(3);
    expect(versions[0]).toMatchObject({ version: 3, message: 'Restored from v1', body: 'Body v1', current: true });
    expect(versions[1]).toMatchObject({ version: 2, body: 'Body v2', type: 'security' });

    expect((await app.inject({ method: 'POST', url: `/skills/${id}/versions/42/restore` })).statusCode).toBe(404);
    await app.close();
  });

  it('workspace isolation: another workspace cannot read, edit, delete, version or see the skill', async () => {
    const db = pg.handle.db;
    const [other] = await db.insert(t.workspaces).values({ name: 'other-ws' }).returning();
    const [foreign] = await db
      .insert(t.skills)
      .values({ workspaceId: other!.id, name: 'foreign-skill', description: 'd', type: 'custom', source: 'manual', body: 'b' })
      .returning();
    await db.insert(t.skillVersions).values({ skillId: foreign!.id, version: 1, body: 'b', description: 'd', type: 'custom', message: 'x' });

    const app = await makeApp();
    const id = foreign!.id;
    expect((await app.inject({ method: 'GET', url: `/skills/${id}` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'PUT', url: `/skills/${id}`, payload: { body: 'x' } })).statusCode).toBe(404);
    expect((await app.inject({ method: 'DELETE', url: `/skills/${id}` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: `/skills/${id}/versions` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: `/skills/${id}/versions/1` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: `/skills/${id}/versions/1/restore` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: `/skills/${id}/stats` })).statusCode).toBe(404);
    const list = (await app.inject({ method: 'GET', url: '/skills' })).json();
    expect(list.some((s: { id: string }) => s.id === id)).toBe(false);
    // the same name is allowed in the default workspace (unique per workspace)
    expect((await app.inject({ method: 'POST', url: '/skills', payload: base('foreign-skill') })).statusCode).toBe(201);
    await app.close();
  });

  describe('POST /skills/import/preview', () => {
    async function preview(filename: string, data: Buffer | string) {
      const app = await makeApp();
      const { body, contentType } = buildMultipart(filename, data);
      const res = await app.inject({
        method: 'POST',
        url: '/skills/import/preview',
        headers: { 'content-type': contentType },
        payload: body,
      });
      await app.close();
      return res;
    }

    it('returns a draft, flags name conflicts, and writes NOTHING to the DB', async () => {
      const before = (await pg.handle.db.select().from(t.skills)).length;
      const res = await preview('flaky.md', SKILL_MD);
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({
        name: 'flaky-import', description: 'Import me.', type: 'custom',
        file: { name: 'flaky.md', kind: 'md' }, ignored: [], name_conflict: false,
      });
      expect(res.json().tokens).toBeGreaterThan(0);

      const app = await makeApp();
      await app.inject({ method: 'POST', url: '/skills', payload: base('flaky-import') });
      await app.close();
      const again = await preview('flaky.md', SKILL_MD);
      expect(again.json().name_conflict).toBe(true);

      const after = (await pg.handle.db.select().from(t.skills)).length;
      expect(after).toBe(before + 1); // only the explicit POST above
    });

    it('zip: SKILL.md used, scripts/ reported as ignored', async () => {
      const zip = buildZip([
        { path: 'SKILL.md', data: SKILL_MD },
        { path: 'scripts/find.sh', data: 'echo hi' },
      ]);
      const res = await preview('flaky-tests.zip', zip);
      expect(res.statusCode).toBe(200);
      expect(res.json().file.kind).toBe('zip');
      expect(res.json().ignored).toEqual([{ path: 'scripts/find.sh', reason: 'script' }]);
    });

    it('422 for a zip without SKILL.md, an unsupported file type and a non-multipart body', async () => {
      expect((await preview('x.zip', buildZip([{ path: 'a.txt', data: 'x' }]))).statusCode).toBe(422);
      expect((await preview('x.exe', 'MZ')).statusCode).toBe(422);
      const app = await makeApp();
      const res = await app.inject({ method: 'POST', url: '/skills/import/preview', payload: { a: 1 } });
      expect(res.statusCode).toBe(422);
      await app.close();
    });

    it('413 over the 1 MB upload limit and for a zip bomb header', async () => {
      const big = await preview('big.md', Buffer.alloc(1024 * 1024 + 100_000, 'a'));
      expect(big.statusCode).toBe(413);
      const bomb = buildZip([
        { path: 'SKILL.md', data: SKILL_MD },
        { path: 'b.bin', data: 'x', declaredSize: 50 * 1024 * 1024 },
      ]);
      expect((await preview('bomb.zip', bomb)).statusCode).toBe(413);
      const exact = await preview('big2.md', Buffer.from('x'.repeat(40_001)));
      expect(exact.statusCode).toBe(413); // body over MAX_SKILL_BODY_CHARS
    });
  });
});
