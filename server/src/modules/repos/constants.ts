/**
 * F1 — repos module constants (extracted from routes.ts; no behaviour change).
 */

/** JobRunner kind for the asynchronous `git clone` job. */
export const CLONE_JOB_KIND = 'clone';

/** Clone depth — shallow clone (latest commit only) keeps imports fast. */
export const CLONE_DEPTH = 1;

/** Secret name (via the Secrets adapter) holding the GitHub PAT for private clones. */
export const GITHUB_TOKEN_SECRET = 'GITHUB_TOKEN';

/**
 * Parse `owner`/`repo` from the SSH form only: `git@github.com:owner/repo.git`.
 * Fully anchored (`^...$`) — must match the whole string, not a substring,
 * so an SSRF payload can't smuggle `github.com/owner/repo` inside an
 * otherwise-unrelated URL. The https form is parsed via `new URL()` instead
 * (see `parseRepoUrl` in helpers.ts) because `URL` already rejects malformed
 * hosts; regex alone can't safely validate a hostname.
 */
export const GITHUB_SSH_URL_REGEX = /^git@github\.com:([^/]+)\/([^/.]+)(?:\.git)?$/;

/** Path-segment safety check for the extracted `owner`/`repo` — rejects
 *  `.`/`..`/empty/anything that isn't a plain identifier, so a validated
 *  owner/repo can never be used to escape the clone directory via
 *  `path.join(cloneDir, owner, repo)`. */
export const SAFE_PATH_SEGMENT = /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/;

/** Username embedded into an authenticated https github.com clone URL. */
export const GIT_TOKEN_USERNAME = 'x-access-token';

/** Host for which a token is embedded into an https clone URL. */
export const GITHUB_HTTPS_HOST = 'github.com';
