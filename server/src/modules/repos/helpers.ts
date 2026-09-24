import { type Repo } from '@devdigest/shared';
import * as t from '../../db/schema.js';
import { AppError } from '../../platform/errors.js';
import {
  GITHUB_SSH_URL_REGEX,
  SAFE_PATH_SEGMENT,
  GIT_TOKEN_USERNAME,
  GITHUB_HTTPS_HOST,
} from './constants.js';

/**
 * F1 — repos pure helpers (extracted from routes.ts; no behaviour change).
 * Pure functions only — no I/O, no DB, no container.
 */

function invalidRepoUrl(url: string): never {
  throw new AppError('invalid_repo_url', `Could not parse owner/repo from '${url}'`, 400);
}

/** `owner`/`name` must be plain identifiers — used verbatim in a clone-path
 *  `path.join`, so `.`/`..`/empty segments must never reach the caller. */
function assertSafeSegments(owner: string, name: string, url: string): void {
  if (!SAFE_PATH_SEGMENT.test(owner) || !SAFE_PATH_SEGMENT.test(name)) invalidRepoUrl(url);
}

/**
 * Parse `owner`/`name` from a GitHub URL (https or ssh form).
 *
 * SECURITY: this is the only gate before the URL is handed to `git clone`
 * (see `RepoService.runCloneJob`), so it must actually validate the host —
 * not just find a `github.com/owner/repo`-shaped substring somewhere in the
 * string (a prior version did, which let a URL like
 * `https://internal-host/x?y=github.com/owner/repo` or a `file://` URL pass
 * as if it were the named GitHub repo — SSRF / local-file read). The https
 * form is parsed with `new URL()` and an exact hostname check; the ssh form
 * uses a fully `^...$`-anchored regex. Both forms then re-validate the
 * extracted owner/name as plain path segments (see `assertSafeSegments`).
 */
export function parseRepoUrl(url: string): { owner: string; name: string } {
  try {
    const u = new URL(url);
    if (u.protocol === 'https:' && u.hostname === GITHUB_HTTPS_HOST) {
      const segments = u.pathname.replace(/\.git$/, '').split('/').filter(Boolean);
      if (segments.length !== 2) invalidRepoUrl(url);
      const [owner, name] = segments as [string, string];
      assertSafeSegments(owner, name, url);
      return { owner, name };
    }
  } catch (e) {
    if (e instanceof AppError) throw e;
    /* not a valid absolute URL — fall through to the ssh form below */
  }

  // git@github.com:owner/repo.git — fully anchored, can't match a substring.
  const match = url.match(GITHUB_SSH_URL_REGEX);
  if (!match?.[1] || !match[2]) invalidRepoUrl(url);
  const [, owner, name] = match;
  assertSafeSegments(owner, name, url);
  return { owner, name };
}

/**
 * Embed a token into an https github.com URL so private clones authenticate
 * non-interactively. SSH/non-GitHub URLs are left untouched.
 */
export function withGitHubToken(url: string, token: string): string {
  try {
    const u = new URL(url);
    if (u.protocol === 'https:' && u.hostname === GITHUB_HTTPS_HOST) {
      u.username = GIT_TOKEN_USERNAME;
      u.password = token;
      return u.toString();
    }
  } catch {
    /* non-URL (e.g. git@github.com:...) — leave as-is */
  }
  return url;
}

/** Map a persisted repo row to the API `Repo` DTO. */
export function toRepoDto(row: typeof t.repos.$inferSelect): Repo {
  return {
    id: row.id,
    workspace_id: row.workspaceId,
    owner: row.owner,
    name: row.name,
    full_name: row.fullName,
    default_branch: row.defaultBranch,
    clone_path: row.clonePath,
    last_polled_at: row.lastPolledAt?.toISOString() ?? null,
    created_by: row.createdBy,
  };
}
