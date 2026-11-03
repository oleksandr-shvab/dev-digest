import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { GitClient } from '@devdigest/shared';
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
  console.warn('[project-context] Docker not available — skipping integration tests.');
}

d('project context endpoints (Testcontainers pg)', () => {
  let pg: PgFixture;
  let defaultWorkspaceId: string;
  let otherWorkspaceId: string;
  let seq = 0;

  beforeAll(async () => {
    pg = await startPg();
    ({ workspaceId: defaultWorkspaceId } = await seed(pg.handle.db));
    const [ws] = await pg.handle.db
      .insert(t.workspaces)
      .values({ name: 'Other workspace' })
      .returning({ id: t.workspaces.id });
    otherWorkspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp(git: GitClient) {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({ config, db: pg.handle.db, overrides: { git, github: new MockGitHubClient() } });
  }
  type App = Awaited<ReturnType<typeof makeApp>>;

  async function newRepo(workspaceId: string): Promise<string> {
    const name = `docs-repo-${seq++}`;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
      .returning({ id: t.repos.id });
    return repo!.id;
  }

  /** A repo in the workspace the local no-auth provider resolves to. */
  async function defaultWorkspaceRepo(): Promise<string> {
    return newRepo(defaultWorkspaceId);
  }

  async function newAgent(app: App, name: string): Promise<string> {
    const res = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: { name, provider: 'openai', model: 'gpt-4.1', system_prompt: 'review' },
    });
    return res.json().id as string;
  }
  async function newSkill(app: App, name: string): Promise<string> {
    const res = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { name, description: 'd', type: 'rubric', body: 'body' },
    });
    return res.json().id as string;
  }

  describe('GET /repos/:id/context/docs', () => {
    it('lists docs with type, size and tokens, and hides node_modules, symlinks and non-.md', async () => {
      const app = await makeApp(
        new MockGitClient({
          head: 'a'.repeat(40),
          files: {
            'specs/a.md': '# Spec A\nhello world',
            'docs/x/b.md': '# B',
            'insights/i.md': '# I',
            'README.md': '# root',
            'docs/notes.txt': 'no',
            'node_modules/foo/docs/README.md': '# dep',
          },
          symlinks: ['specs/evil.md'],
        }),
      );
      const repoId = await defaultWorkspaceRepo();
      const res = await app.inject({ method: 'GET', url: `/repos/${repoId}/context/docs` });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.status).toBe('ok');
      expect(body.commit).toBe('a'.repeat(40));
      expect(body.globs).toEqual(['**/{specs,docs,insights}/**/*.md']);
      expect(body.total).toBe(3);
      expect(body.docs.map((x: { path: string; type: string }) => [x.path, x.type])).toEqual([
        ['docs/x/b.md', 'docs'],
        ['insights/i.md', 'insights'],
        ['specs/a.md', 'specs'],
      ]);
      const a = body.docs.find((x: { path: string }) => x.path === 'specs/a.md');
      expect(a.size).toBe(Buffer.byteLength('# Spec A\nhello world'));
      expect(a.tokens).toBeGreaterThan(0);
      expect(a.used_by).toBe(0);
    });

    it('returns 404 for a repo of another workspace', async () => {
      const app = await makeApp(new MockGitClient({ files: { 'specs/a.md': '# a' } }));
      const foreign = await newRepo(otherWorkspaceId);
      const res = await app.inject({ method: 'GET', url: `/repos/${foreign}/context/docs` });
      expect(res.statusCode).toBe(404);
    });

    it('reports no_mirror when the git calls throw and no_matches when nothing matches', async () => {
      const broken = new MockGitClient();
      broken.listTree = async () => {
        throw new Error('no clone');
      };
      const repoId = await defaultWorkspaceRepo();
      const r1 = await (await makeApp(broken)).inject({ method: 'GET', url: `/repos/${repoId}/context/docs` });
      expect(r1.json()).toMatchObject({ status: 'no_mirror', commit: null, total: 0, docs: [] });

      const r2 = await (await makeApp(new MockGitClient({ files: { 'README.md': '# r' } }))).inject({
        method: 'GET',
        url: `/repos/${repoId}/context/docs`,
      });
      expect(r2.json()).toMatchObject({ status: 'no_matches', total: 0, docs: [] });
    });

    it('caps the list at 1,000 docs and reports the true total', async () => {
      const files: Record<string, string> = {};
      for (let i = 0; i < 1001; i++) files[`docs/d${String(i).padStart(4, '0')}.md`] = `# ${i}`;
      const app = await makeApp(new MockGitClient({ files }));
      const repoId = await defaultWorkspaceRepo();
      const body = (await app.inject({ method: 'GET', url: `/repos/${repoId}/context/docs` })).json();
      expect(body.total).toBe(1001);
      expect(body.docs).toHaveLength(1000);
    });

    it('counts used_by: direct and via an enabled link, not via a disabled link', async () => {
      const app = await makeApp(
        new MockGitClient({ files: { 'specs/ub-direct.md': '# d', 'specs/ub-skill.md': '# s', 'specs/ub-off.md': '# o' } }),
      );
      const repoId = await defaultWorkspaceRepo();
      const direct = await newAgent(app, 'UB direct');
      const viaSkill = await newAgent(app, 'UB via skill');
      const viaOff = await newAgent(app, 'UB via disabled link');
      const both = await newAgent(app, 'UB both');
      const skillOn = await newSkill(app, 'ub-on');
      const skillOff = await newSkill(app, 'ub-off');

      const put = (url: string, payload: unknown) => app.inject({ method: 'PUT', url, payload });
      expect((await put(`/skills/${skillOn}/context`, { paths: ['specs/ub-skill.md', 'specs/ub-direct.md'] })).statusCode).toBe(200);
      expect((await put(`/skills/${skillOff}/context`, { paths: ['specs/ub-off.md'] })).statusCode).toBe(200);
      await put(`/agents/${direct}/context`, { paths: ['specs/ub-direct.md'] });
      await put(`/agents/${both}/context`, { paths: ['specs/ub-skill.md'] });
      await put(`/agents/${viaSkill}/skills`, { items: [{ skill_id: skillOn, enabled: true }] });
      await put(`/agents/${both}/skills`, { items: [{ skill_id: skillOn, enabled: true }] });
      await put(`/agents/${viaOff}/skills`, { items: [{ skill_id: skillOff, enabled: false }] });

      const body = (await app.inject({ method: 'GET', url: `/repos/${repoId}/context/docs` })).json();
      const used = Object.fromEntries(body.docs.map((x: { path: string; used_by: number }) => [x.path, x.used_by]));
      // ub-direct: `direct` (own) + `viaSkill` and `both` (through skillOn) = 3
      expect(used['specs/ub-direct.md']).toBe(3);
      // ub-skill: `viaSkill` (skill) + `both` (own AND skill, counted once) = 2
      expect(used['specs/ub-skill.md']).toBe(2);
      // ub-off: only reachable through a disabled link
      expect(used['specs/ub-off.md']).toBe(0);
    });
  });

  describe('GET /repos/:id/context/docs/content', () => {
    it('returns the content and rejects traversal, symlinks and unknown paths', async () => {
      const app = await makeApp(
        new MockGitClient({
          files: { 'specs/read.md': '# Read me', 'node_modules/foo/docs/README.md': '# dep' },
          symlinks: ['specs/link.md'],
        }),
      );
      const repoId = await defaultWorkspaceRepo();
      const url = (p: string) => `/repos/${repoId}/context/docs/content?path=${encodeURIComponent(p)}`;

      const ok = await app.inject({ method: 'GET', url: url('specs/read.md') });
      expect(ok.statusCode).toBe(200);
      expect(ok.json()).toMatchObject({ path: 'specs/read.md', type: 'specs', content: '# Read me' });

      expect((await app.inject({ method: 'GET', url: url('../../etc/passwd.md') })).statusCode).toBe(422);
      expect((await app.inject({ method: 'GET', url: url('node_modules/foo/docs/README.md') })).statusCode).toBe(422);
      expect((await app.inject({ method: 'GET', url: url('specs/link.md') })).statusCode).toBe(404);
      expect((await app.inject({ method: 'GET', url: url('specs/missing.md') })).statusCode).toBe(404);
    });

    it('returns 404 for a repo of another workspace', async () => {
      const app = await makeApp(new MockGitClient({ files: { 'specs/a.md': '# a' } }));
      const foreign = await newRepo(otherWorkspaceId);
      const res = await app.inject({
        method: 'GET',
        url: `/repos/${foreign}/context/docs/content?path=specs/a.md`,
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('PUT /agents/:id/context and /skills/:id/context', () => {
    it('stores the path list in order without bumping the agent version or adding a version row', async () => {
      const app = await makeApp(new MockGitClient());
      const agentId = await newAgent(app, 'Ctx agent');
      const before = (await app.inject({ method: 'GET', url: `/agents/${agentId}` })).json();
      const versionsBefore = (await app.inject({ method: 'GET', url: `/agents/${agentId}/versions` })).json();

      const put = await app.inject({
        method: 'PUT',
        url: `/agents/${agentId}/context`,
        payload: { paths: ['specs/b.md', 'docs/a.md', 'specs/b.md'] },
      });
      expect(put.statusCode).toBe(200);
      expect(put.json().context_paths).toEqual(['specs/b.md', 'docs/a.md']);
      expect(put.json().version).toBe(before.version);

      const after = (await app.inject({ method: 'GET', url: `/agents/${agentId}` })).json();
      expect(after.version).toBe(before.version);
      expect(after.context_paths).toEqual(['specs/b.md', 'docs/a.md']);
      const versionsAfter = (await app.inject({ method: 'GET', url: `/agents/${agentId}/versions` })).json();
      expect(versionsAfter).toHaveLength(versionsBefore.length);

      // A normal config edit keeps the attachments.
      await app.inject({ method: 'PUT', url: `/agents/${agentId}`, payload: { system_prompt: 'changed' } });
      const kept = (await app.inject({ method: 'GET', url: `/agents/${agentId}` })).json();
      expect(kept.context_paths).toEqual(['specs/b.md', 'docs/a.md']);
    });

    it('stores a skill list without bumping version, versions or updated_at, and PUT /skills/:id keeps it', async () => {
      const app = await makeApp(new MockGitClient());
      const skillId = await newSkill(app, 'ctx-skill');
      const before = (await app.inject({ method: 'GET', url: `/skills/${skillId}` })).json();
      const versionsBefore = (await app.inject({ method: 'GET', url: `/skills/${skillId}/versions` })).json();

      const put = await app.inject({
        method: 'PUT',
        url: `/skills/${skillId}/context`,
        payload: { paths: ['docs/z.md', 'specs/a.md'] },
      });
      expect(put.statusCode).toBe(200);
      expect(put.json()).toMatchObject({ version: before.version, context_paths: ['docs/z.md', 'specs/a.md'] });
      expect(put.json().updated_at).toBe(before.updated_at);
      const versionsAfter = (await app.inject({ method: 'GET', url: `/skills/${skillId}/versions` })).json();
      expect(versionsAfter).toHaveLength(versionsBefore.length);

      const edit = await app.inject({ method: 'PUT', url: `/skills/${skillId}`, payload: { body: 'new body' } });
      expect(edit.statusCode).toBe(200);
      expect(edit.json().version).toBe(before.version + 1);
      expect(edit.json().context_paths).toEqual(['docs/z.md', 'specs/a.md']);
    });

    it('rejects a traversal path and an over-long list with 422', async () => {
      const app = await makeApp(new MockGitClient());
      const agentId = await newAgent(app, 'Ctx invalid');
      const skillId = await newSkill(app, 'ctx-invalid');
      for (const url of [`/agents/${agentId}/context`, `/skills/${skillId}/context`]) {
        const bad = await app.inject({ method: 'PUT', url, payload: { paths: ['../x.md'] } });
        expect(bad.statusCode).toBe(422);
        const many = await app.inject({
          method: 'PUT',
          url,
          payload: { paths: Array.from({ length: 201 }, (_, i) => `docs/${i}.md`) },
        });
        expect(many.statusCode).toBe(422);
      }
    });

    it('returns 404 for an agent or skill of another workspace', async () => {
      const app = await makeApp(new MockGitClient());
      const [agent] = await pg.handle.db
        .insert(t.agents)
        .values({
          workspaceId: otherWorkspaceId,
          name: 'Foreign agent',
          provider: 'openai',
          model: 'gpt-4.1',
          systemPrompt: 's',
        })
        .returning({ id: t.agents.id });
      const [skill] = await pg.handle.db
        .insert(t.skills)
        .values({
          workspaceId: otherWorkspaceId,
          name: 'foreign-skill',
          description: 'd',
          type: 'rubric',
          source: 'manual',
          body: 'b',
        })
        .returning({ id: t.skills.id });
      const a = await app.inject({ method: 'PUT', url: `/agents/${agent!.id}/context`, payload: { paths: ['docs/a.md'] } });
      const s = await app.inject({ method: 'PUT', url: `/skills/${skill!.id}/context`, payload: { paths: ['docs/a.md'] } });
      expect(a.statusCode).toBe(404);
      expect(s.statusCode).toBe(404);
    });
  });
});
