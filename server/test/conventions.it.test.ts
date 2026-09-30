import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient, MockLLMProvider } from '../src/adapters/mocks.js';
import type { RepoIntel } from '../src/modules/repo-intel/types.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[conventions] Docker not available — skipping integration tests.');
}

/** Only `getConventionSamples` is exercised; the rest of the facade is unused here. */
function stubRepoIntel(codeSamples: string[]): RepoIntel {
  return {
    getConventionSamples: async () => codeSamples,
  } as unknown as RepoIntel;
}

const GOOD_SNIPPET = 'return doWork();';
const INDEX_TS = ['export function handler() {', `  ${GOOD_SNIPPET}`, '}', ''].join('\n');

function extractionFixture(overrides: { rule?: string; snippet?: string; path?: string } = {}) {
  return {
    candidates: [
      {
        category: 'error-handling',
        rule: overrides.rule ?? 'Route handlers delegate to a doWork() function.',
        evidence: {
          path: overrides.path ?? 'server/index.ts',
          line: 2,
          snippet: overrides.snippet ?? GOOD_SNIPPET,
        },
        confidence: 0.8,
      },
      {
        // A path the model hallucinated — never sampled.
        category: 'naming',
        rule: 'Hallucinated rule about a file we never showed the model.',
        evidence: { path: 'server/ghost.ts', line: 1, snippet: 'whatever' },
        confidence: 0.5,
      },
      {
        // A real path, but the snippet is nowhere near it.
        category: 'formatting',
        rule: 'A rule whose snippet cannot be found nearby.',
        evidence: { path: 'server/index.ts', line: 2, snippet: 'this text never appears in the file' },
        confidence: 0.5,
      },
    ],
  };
}

d('conventions module (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let clonePath: string;

  beforeAll(async () => {
    pg = await startPg();
    ({ workspaceId } = await seed(pg.handle.db));
    clonePath = await mkdtemp(join(tmpdir(), 'devdigest-conventions-'));
    await writeFile(join(clonePath, '.eslintrc.json'), '{}');
    await mkdir(join(clonePath, 'server'), { recursive: true });
    await writeFile(join(clonePath, 'server/index.ts'), INDEX_TS);
  });
  afterAll(async () => {
    await pg?.stop();
    if (clonePath) await rm(clonePath, { recursive: true, force: true });
  });

  async function makeRepo(opts: { clonePath?: string | null } = { clonePath }) {
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({
        workspaceId,
        owner: 'acme',
        name: `widgets-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        fullName: `acme/widgets-${Date.now()}`,
        clonePath: opts.clonePath ?? null,
      })
      .returning();
    return repo!;
  }

  function makeApp(fixture: unknown = extractionFixture()) {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    const mockLlm = new MockLLMProvider('openai', { structuredBySchema: { ConventionExtraction: fixture } });
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient(),
        github: new MockGitHubClient(),
        llm: { openai: mockLlm },
        repoIntel: stubRepoIntel(['server/index.ts']),
      },
    });
  }

  it('extract: verifies evidence, drops what fails, persists what survives, and returns it after reload', async () => {
    const repo = await makeRepo();
    const app = await makeApp();

    const res = await app.inject({ method: 'POST', url: `/repos/${repo.id}/conventions/extract` });
    expect(res.statusCode).toBe(200);
    const result = res.json();
    expect(result.model).toBe('gpt-5.4'); // FEATURE_MODELS default for 'conventions'
    expect(result.samples.sort()).toEqual(['.eslintrc.json', 'server/index.ts'].sort());
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      rule: 'Route handlers delegate to a doWork() function.',
      evidence_path: 'server/index.ts',
      evidence_line: 2,
      status: 'pending',
    });
    expect(result.dropped.sort((a: { reason: string }, b: { reason: string }) => a.reason.localeCompare(b.reason))).toEqual(
      [
        { rule: 'Hallucinated rule about a file we never showed the model.', reason: 'path_not_sampled' },
        { rule: 'A rule whose snippet cannot be found nearby.', reason: 'snippet_not_found' },
      ].sort((a, b) => a.reason.localeCompare(b.reason)),
    );

    // "reload" — a plain GET must return the same persisted candidate.
    const listed = (await app.inject({ method: 'GET', url: `/repos/${repo.id}/conventions` })).json();
    expect(listed).toHaveLength(1);
    expect(listed[0].id).toBe(result.candidates[0].id);
    await app.close();
  });

  it('409 repo_not_indexed when the repo has no clone', async () => {
    const repo = await makeRepo({ clonePath: null });
    const app = await makeApp();
    const res = await app.inject({ method: 'POST', url: `/repos/${repo.id}/conventions/extract` });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('repo_not_indexed');
    await app.close();
  });

  it('rescan keeps accepted/rejected, replaces pending, and suppresses a rejected rule', async () => {
    const repo = await makeRepo();
    const app = await makeApp();

    const first = (await app.inject({ method: 'POST', url: `/repos/${repo.id}/conventions/extract` })).json();
    const keptId = first.candidates[0].id as string;
    const accept = await app.inject({ method: 'PATCH', url: `/conventions/${keptId}`, payload: { status: 'accepted' } });
    expect(accept.statusCode).toBe(200);

    // A second, unrelated pending candidate from a rescan.
    const other = extractionFixture({ rule: 'A second, throwaway rule.', path: 'server/index.ts', snippet: GOOD_SNIPPET });
    const appWithExtra = await makeApp(other);
    const secondScan = (await appWithExtra.inject({ method: 'POST', url: `/repos/${repo.id}/conventions/extract` })).json();
    // The accepted rule from the first scan is untouched and still present...
    expect(secondScan.candidates.some((c: { id: string }) => c.id === keptId)).toBe(true);
    // ...and this scan's own candidate is inserted fresh alongside it.
    const freshRow = secondScan.candidates.find((c: { id: string }) => c.id !== keptId);
    expect(freshRow.rule).toBe('A second, throwaway rule.');

    // Reject the fresh one, then rescan with the SAME rule again — it must not come back.
    await appWithExtra.inject({ method: 'PATCH', url: `/conventions/${freshRow.id}`, payload: { status: 'rejected' } });
    const third = await appWithExtra.inject({ method: 'POST', url: `/repos/${repo.id}/conventions/extract` });
    const thirdBody = third.json();
    expect(thirdBody.dropped).toEqual(
      expect.arrayContaining([{ rule: 'A second, throwaway rule.', reason: 'rejected_before' }]),
    );
    expect(thirdBody.candidates.some((c: { rule: string }) => c.rule === 'A second, throwaway rule.')).toBe(false);
    expect(thirdBody.candidates.some((c: { id: string }) => c.id === keptId)).toBe(true);

    await app.close();
    await appWithExtra.close();
  });

  it('PATCH edits the rule inline and marks it edited; workspace isolation applies', async () => {
    const repo = await makeRepo();
    const app = await makeApp();
    const scan = (await app.inject({ method: 'POST', url: `/repos/${repo.id}/conventions/extract` })).json();
    const id = scan.candidates[0].id as string;

    const edited = await app.inject({
      method: 'PATCH',
      url: `/conventions/${id}`,
      payload: { rule: 'A hand-edited version of this rule.' },
    });
    expect(edited.json()).toMatchObject({ rule: 'A hand-edited version of this rule.', edited: true });

    const [other] = await pg.handle.db.insert(t.workspaces).values({ name: `other-ws-${Date.now()}` }).returning();
    const [foreignRepo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId: other!.id, owner: 'x', name: 'y', fullName: 'x/y' })
      .returning();
    const [foreign] = await pg.handle.db
      .insert(t.conventions)
      .values({
        workspaceId: other!.id,
        repoId: foreignRepo!.id,
        category: 'other',
        rule: 'foreign rule',
        evidencePath: 'a.ts',
        evidenceLine: 1,
        evidenceSnippet: 'x',
        confidence: 0.5,
        status: 'accepted',
      })
      .returning();
    expect((await app.inject({ method: 'PATCH', url: `/conventions/${foreign!.id}`, payload: { status: 'rejected' } })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: `/repos/${foreignRepo!.id}/conventions` })).statusCode).toBe(404);
    await app.close();
  });

  it('skill-draft: 400 unless every candidate id is accepted; builds a grouped body otherwise', async () => {
    const repo = await makeRepo();
    const app = await makeApp();
    const scan = (await app.inject({ method: 'POST', url: `/repos/${repo.id}/conventions/extract` })).json();
    const id = scan.candidates[0].id as string;

    const pendingDraft = await app.inject({
      method: 'POST',
      url: `/repos/${repo.id}/conventions/skill-draft`,
      payload: { candidate_ids: [id] },
    });
    expect(pendingDraft.statusCode).toBe(400);

    await app.inject({ method: 'PATCH', url: `/conventions/${id}`, payload: { status: 'accepted' } });
    const draft = await app.inject({
      method: 'POST',
      url: `/repos/${repo.id}/conventions/skill-draft`,
      payload: { candidate_ids: [id] },
    });
    expect(draft.statusCode).toBe(200);
    expect(draft.json()).toMatchObject({
      name: 'repo-conventions',
      type: 'convention',
      evidence_files: ['server/index.ts'],
    });
    expect(draft.json().body).toContain('Route handlers delegate to a doWork() function.');
    await app.close();
  });

  it('create skill: links agents, sets source=extracted; re-extract versions it; a manual name clash 409s', async () => {
    const repo = await makeRepo();
    const app = await makeApp();
    const scan = (await app.inject({ method: 'POST', url: `/repos/${repo.id}/conventions/extract` })).json();
    const id = scan.candidates[0].id as string;
    await app.inject({ method: 'PATCH', url: `/conventions/${id}`, payload: { status: 'accepted' } });

    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Conv Agent', provider: 'openai', model: 'gpt-4.1', system_prompt: 'Review.' },
      })
    ).json();

    const created = await app.inject({
      method: 'POST',
      url: `/repos/${repo.id}/conventions/skill`,
      payload: {
        name: 'repo-conventions',
        description: 'Extracted conventions.',
        type: 'convention',
        body: '## Error handling\n- Route handlers delegate to a doWork() function.',
        evidence_files: ['server/index.ts'],
        candidate_ids: [id],
        agent_ids: [agent.id],
      },
    });
    expect(created.statusCode).toBe(201);
    const skill = created.json();
    expect(skill).toMatchObject({ name: 'repo-conventions', source: 'extracted', version: 1 });
    expect(skill.evidence_files).toEqual(['server/index.ts']);

    const links = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/skills` })).json();
    expect(links.map((l: { skill: { id: string } }) => l.skill.id)).toContain(skill.id);

    // Re-extract onto the SAME skill: saves a new version, doesn't create a second skill.
    const reCreated = await app.inject({
      method: 'POST',
      url: `/repos/${repo.id}/conventions/skill`,
      payload: {
        name: 'repo-conventions',
        description: 'Extracted conventions.',
        type: 'convention',
        body: '## Error handling\n- Updated body.',
        evidence_files: ['server/index.ts'],
        candidate_ids: [id],
        agent_ids: [],
      },
    });
    expect(reCreated.statusCode).toBe(200);
    expect(reCreated.json()).toMatchObject({ id: skill.id, version: 2, body: '## Error handling\n- Updated body.' });

    // A manual skill with the same target name is a genuine conflict.
    await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { name: 'manual-conventions', description: 'd', type: 'custom', body: 'b' },
    });
    const clash = await app.inject({
      method: 'POST',
      url: `/repos/${repo.id}/conventions/skill`,
      payload: {
        name: 'manual-conventions',
        description: 'd2',
        type: 'convention',
        body: 'b2',
        evidence_files: [],
        candidate_ids: [id],
        agent_ids: [],
      },
    });
    expect(clash.statusCode).toBe(409);
    await app.close();
  });
});
