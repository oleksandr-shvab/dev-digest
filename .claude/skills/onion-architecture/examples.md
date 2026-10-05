# Examples

Concrete good/bad patterns for [SKILL.md](SKILL.md). "Good" examples are
real code from `server/`/`reviewer-core/` — follow them exactly, don't
paraphrase.

## Port-interface-first integration

**Good** — the port is defined once, independent of any SDK:

```ts
// server/src/vendor/shared/adapters.ts
export interface GitHubClient {
  listPullRequests(repo: RepoRef): Promise<PrMeta[]>;
  getPullRequest(repo: RepoRef, n: number): Promise<PrDetail>;
  postReview(repo: RepoRef, n: number, review: GitHubReviewPayload): Promise<{ id: string }>;
  // ...
}
```

The implementation depends on the port, not the other way around:

```ts
// server/src/adapters/github/octokit.ts
import { Octokit } from 'octokit';
import type { GitHubClient, RepoRef, PrMeta /* ... */ } from '@devdigest/shared';

export class OctokitGitHubClient implements GitHubClient {
  private octokit: Octokit;
  // ...
}
```

Wired exactly once, in the composition root:

```ts
// server/src/platform/container.ts
async github(): Promise<GitHubClient> {
  if (this.overrides.github) return this.overrides.github;
  if (this._github) return this._github;
  const token = await this.secrets.get('GITHUB_TOKEN');
  if (!token) throw new ConfigError('GITHUB_TOKEN is not configured');
  this._github = new OctokitGitHubClient(token);
  return this._github;
}
```

Tests swap the whole ring with zero mocking framework, through the same
seam production code uses:

```ts
// server/test/routes-smoke.test.ts
overrides: { github: new MockGitHubClient({ login: 'octocat' }) },
```

**Bad** — a service reaching straight for the SDK:

```ts
// hypothetical server/src/modules/repos/service.ts — DON'T DO THIS
import { Octokit } from 'octokit'; // ✗ concrete SDK import in a service

export class ReposService {
  private octokit = new Octokit({ auth: process.env.GITHUB_TOKEN }); // ✗ bypasses container, secrets, port

  async listPulls(repo: string) {
    return this.octokit.rest.pulls.list({ /* ... */ });
  }
}
```

Why it's bad: this service can now only be tested against a live (or
network-mocked) GitHub API, it duplicates token resolution that
`SecretsProvider` already owns, and swapping GitHub for GitLab later means
rewriting this service instead of adding one adapter.

## Thin routes

**Good** — `server/src/modules/reviews/routes.ts`, the reference shape:

```ts
export default async function reviewsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new ReviewService(container);

  app.post(
    '/pulls/:id/review',
    { schema: { params: IdParams }, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      const body = RunRequest.parse(req.body ?? {});
      const targets = await service.resolveTargets(workspaceId, { /* ... */ });
      const { runs, reviews } = await service.runReview(workspaceId, req.params.id, targets);
      return { runs, reviews };
    },
  );
}
```

The route: scopes the workspace, parses input, calls the service, returns
the result. No decision-making happens here.

**Bad** — logic and persistence leaking into the route:

```ts
// hypothetical — DON'T DO THIS
app.post('/pulls/:id/review', async (req) => {
  const pull = await container.db.select().from(t.pulls).where(eq(t.pulls.id, req.params.id)); // ✗ Drizzle in a route
  if (!pull.length) throw new NotFoundError('pull');
  const diff = await loadDiff(pull[0]); // ✗ business logic in a route
  const findings = await groundFindings(await llm.completeStructured(/* ... */)); // ✗ orchestration in a route
  await container.db.insert(t.reviews).values({ /* ... */ }); // ✗ persistence in a route
  return { findings };
});
```

Why it's bad: this can't be reused by any other caller (SSE replay, a
future CLI, a test that only wants `resolveTargets`), it can't be unit
tested without a real Fastify + real DB, and it duplicates logic that
already lives in `ReviewService`/`ReviewRunExecutor`.

## Repository owns persistence

**Good** — `server/src/modules/reviews/repository.ts`'s own docstring
states the rule and the class enforces it:

```ts
/**
 * A2 — review data-access. The ONLY layer touching the DB for the review
 * domain. Owns `reviews`, `findings`, `pr_intent`, and persists the
 * observability rows `agent_runs` + `run_traces`.
 */
export class ReviewRepository {
  constructor(private db: Db) {}
  getPull(workspaceId: string, prId: string): Promise<PullRow | undefined> {
    return pullRepo.getPull(this.db, workspaceId, prId);
  }
  // ...
}
```

`ReviewService` calls `this.repo.getPull(...)` — it never imports
`drizzle-orm` or `../../db/schema.js` itself.

**Bad** — a service importing the schema directly:

```ts
// hypothetical server/src/modules/reviews/service.ts — DON'T DO THIS
import * as t from '../../db/schema.js'; // ✗ service reaching past its own repository
import { eq } from 'drizzle-orm';

export class ReviewService {
  async getPull(id: string) {
    return this.container.db.select().from(t.pulls).where(eq(t.pulls.id, id));
  }
}
```

Why it's bad: now two places know the `pulls` table shape and query
pattern; a schema change has to be hunted down in services as well as
repositories, and the service can no longer be tested against a fake
repository — only a real (or Testcontainers) Postgres.

## `reviewer-core` purity

**Good** — `reviewer-core/src/review/run.ts`'s only side effect is the
injected port:

```ts
export async function reviewPullRequest(input: ReviewInput /* incl. llm: LLMProvider */) {
  const prompt = assemblePrompt(/* ... */);
  const raw = await input.llm.completeStructured({ /* ... */ }); // the ONE side effect
  const grounded = groundFindings(raw.findings, input.diff);
  return { review: /* ... */, groundingSummary: groundingSummary(grounded) };
}
```

No `fs`, no `child_process`, no DB client, no `octokit` — confirmed by
`reviewer-core/package.json`'s dependencies: only `openai` (SDK types for
the LLM port shape) and `zod`.

**Bad** — reaching for a "quick" filesystem read inside the engine:

```ts
// hypothetical reviewer-core/src/review/run.ts — DON'T DO THIS
import { readFileSync } from 'node:fs'; // ✗ breaks the purity boundary

export async function reviewPullRequest(input: ReviewInput) {
  const extraContext = readFileSync('./cache/last-review.json', 'utf-8'); // ✗
  // ...
}
```

Why it's bad: this makes `reviewPullRequest` behave differently depending
on the filesystem it happens to run on, breaks the future CI
agent-runner's ability to reuse it unmodified, and makes it untestable with
a plain in-memory `LLMProvider` fake — the entire reason `reviewer-core`
was split out of `server/`.

## `dependency-cruiser` enforcement (draft — propose before adding)

A starting config that encodes the rules above as CI-checkable forbidden
edges (place at `server/.dependency-cruiser.cjs` if/when the team adopts
it — not currently present in the repo):

```js
// server/.dependency-cruiser.cjs (draft — not yet added to the repo)
module.exports = {
  forbidden: [
    {
      name: 'service-no-concrete-adapters',
      comment: 'services depend on ports (@devdigest/shared), not concrete adapters',
      severity: 'error',
      from: { path: '^src/modules/[^/]+/service\\.ts$' },
      to: { path: '^src/adapters' },
    },
    {
      name: 'routes-no-db',
      comment: 'routes stay thin — no direct schema/Drizzle access',
      severity: 'error',
      from: { path: '^src/modules/[^/]+/routes\\.ts$' },
      to: { path: '^src/db' },
    },
    {
      name: 'reviewer-core-no-io',
      comment: 'reviewer-core has zero I/O beyond the injected LLMProvider',
      severity: 'error',
      from: { path: '^\\.\\./reviewer-core/src' },
      to: { path: 'node:(fs|child_process|net)', dependencyTypes: ['core'] },
    },
  ],
  options: { tsPreCompilationDeps: true },
};
```
