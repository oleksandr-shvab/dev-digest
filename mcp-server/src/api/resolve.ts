import type { Repo } from '@devdigest/shared';
import type { DevDigestApi } from './client.js';

/** A problem with what the agent asked for; the message is written for the agent and returned as the tool error. */
export class ToolInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolInputError';
  }
}

const KNOWN_LIMIT = 10;
const CALL_EXAMPLE = '{"repository": "acme/payments-api", "pull_request_number": 482}';

export async function resolveRepository(api: DevDigestApi, repository: string): Promise<Repo> {
  const repos = await api.listRepos();
  const wanted = repository.toLowerCase();
  const found = repos.find((repo) => repo.full_name.toLowerCase() === wanted);
  if (found) return found;

  const known = repos.slice(0, KNOWN_LIMIT).map((repo) => repo.full_name);
  throw new ToolInputError(
    `Repository '${repository}' is not in DevDigest. Known repositories: ${known.length > 0 ? known.join(', ') : 'none'}. Example: ${CALL_EXAMPLE}`,
  );
}

export interface PullRequestRef {
  id: string;
  number: number;
  title: string;
}

export class PullRequestResolver {
  // Per-process cache (owner decision: no new server endpoint). `GET /repos/:id/pulls` runs a GitHub
  // sync before it reads (server/src/modules/pulls/routes.ts:42-113), which is slow online, and the
  // upsert on (repo_id, number) keeps a PR's id stable (routes.ts:66-74), so an id never goes stale.
  private readonly cache = new Map<string, PullRequestRef>();

  constructor(private readonly api: DevDigestApi) {}

  async resolve(repo: Repo, pullRequestNumber: number): Promise<PullRequestRef> {
    const cached = this.cache.get(cacheKey(repo.id, pullRequestNumber));
    if (cached) return cached;

    const pulls = await this.api.listPulls(repo.id);
    const refs: PullRequestRef[] = [];
    for (const pull of pulls) {
      if (!pull.id) continue;
      const ref = { id: pull.id, number: pull.number, title: pull.title };
      this.cache.set(cacheKey(repo.id, pull.number), ref);
      refs.push(ref);
    }

    const found = this.cache.get(cacheKey(repo.id, pullRequestNumber));
    if (found) return found;

    const newest = refs.sort((a, b) => b.number - a.number).slice(0, KNOWN_LIMIT);
    const known = newest.map((ref) => `#${ref.number}`);
    const exampleNumber = newest[0]?.number ?? 1;
    throw new ToolInputError(
      `Pull request #${pullRequestNumber} was not found in ${repo.full_name}. Known PRs: ${known.length > 0 ? known.join(', ') : 'none'} (newest first). Example: {"repository": "${repo.full_name}", "pull_request_number": ${exampleNumber}}`,
    );
  }
}

function cacheKey(repoId: string, pullRequestNumber: number): string {
  return `${repoId}#${pullRequestNumber}`;
}
