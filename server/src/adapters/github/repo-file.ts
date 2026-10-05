import type { CommitFileResult } from '@devdigest/shared';

/**
 * Pure parts of `GitHubClient.getFileAtCommit`: the path check that runs before
 * any request, and the mapping of the repository contents endpoint's response.
 */

const MAX_PATH_CHARS = 400;

/** True when `path` is a plain repo-relative path that cannot leave the repository. */
export function isSafeRepoPath(path: string): boolean {
  if (path.length === 0 || path.length > MAX_PATH_CHARS) return false;
  if (path.startsWith('/') || path.startsWith('-')) return false;
  for (let i = 0; i < path.length; i++) {
    const code = path.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return false;
    if (path[i] === '\\' || path[i] === ':') return false;
  }
  return path.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

/**
 * Map the body of `GET /repos/{owner}/{repo}/contents/{path}`: an array is a
 * directory listing and an object whose `type` is not `file` is a symlink,
 * submodule or directory — none of them is read. The reported `size` is checked
 * before the content is decoded.
 */
export function toCommitFileResult(data: unknown, maxBytes: number): CommitFileResult {
  if (Array.isArray(data)) return { ok: false, reason: 'not_regular_file' };
  if (typeof data !== 'object' || data === null) {
    throw new Error('Unexpected GitHub contents response');
  }
  const file = data as { type?: unknown; size?: unknown; content?: unknown; encoding?: unknown };
  if (file.type !== 'file') return { ok: false, reason: 'not_regular_file' };
  if (typeof file.size === 'number' && file.size > maxBytes) return { ok: false, reason: 'too_large' };
  if (typeof file.content !== 'string' || file.encoding !== 'base64') {
    throw new Error('GitHub contents response has no base64 content');
  }
  const bytes = Buffer.from(file.content, 'base64');
  if (bytes.length > maxBytes) return { ok: false, reason: 'too_large' };
  return { ok: true, content: bytes.toString('utf8') };
}
