import { describe, it, expect } from 'vitest';
import { parseRepoUrl } from '../src/modules/repos/helpers.js';

/**
 * SECURITY: `parseRepoUrl` is the only gate before a user-supplied URL is
 * handed to `git clone` (see `RepoService.runCloneJob`). A prior version
 * matched `github.com/owner/repo` as a substring anywhere in the string,
 * which let non-GitHub URLs (SSRF/local-file targets) through as long as a
 * GitHub-shaped path appeared somewhere in the string. These tests pin the
 * fix: only an exact `github.com` https host or a fully-anchored SSH form
 * is accepted, and the extracted owner/name can't be used for path
 * traversal into the clone directory.
 */
describe('parseRepoUrl', () => {
  it('parses a plain https URL', () => {
    expect(parseRepoUrl('https://github.com/owner/repo')).toEqual({
      owner: 'owner',
      name: 'repo',
    });
  });

  it('parses an https URL with a .git suffix and trailing slash', () => {
    expect(parseRepoUrl('https://github.com/owner/repo.git')).toEqual({
      owner: 'owner',
      name: 'repo',
    });
    expect(parseRepoUrl('https://github.com/owner/repo/')).toEqual({
      owner: 'owner',
      name: 'repo',
    });
  });

  it('parses the ssh form', () => {
    expect(parseRepoUrl('git@github.com:owner/repo.git')).toEqual({
      owner: 'owner',
      name: 'repo',
    });
  });

  it('rejects a URL that only contains a github.com/owner/repo-shaped substring', () => {
    // The historic bug: an unanchored regex matched this as if it were the
    // named GitHub repo, but simple-git would actually clone `internal-host`.
    expect(() => parseRepoUrl('https://internal-host/x?y=github.com/owner/repo')).toThrow(
      /invalid_repo_url|Could not parse/,
    );
  });

  it('rejects a lookalike host (subdomain smuggling)', () => {
    expect(() => parseRepoUrl('https://github.com.evil.com/owner/repo')).toThrow();
  });

  it('rejects a github.com path segment inside an unrelated host', () => {
    expect(() => parseRepoUrl('https://evil.com/github.com/owner/repo')).toThrow();
  });

  it('rejects non-http(s) schemes, including file://', () => {
    expect(() => parseRepoUrl('file:///etc/passwd')).toThrow();
  });

  it('rejects an ssh URL for a non-GitHub host', () => {
    expect(() => parseRepoUrl('git@evil.com:owner/repo.git')).toThrow();
  });

  it('rejects an ssh payload trying to smuggle github.com mid-string', () => {
    expect(() => parseRepoUrl('git@evil.com:x/github.com/owner/repo.git')).toThrow();
  });

  it('rejects path-traversal in the owner segment', () => {
    expect(() => parseRepoUrl('https://github.com/../secrets')).toThrow();
  });

  it('rejects a URL with more than two path segments', () => {
    expect(() => parseRepoUrl('https://github.com/owner/repo/extra')).toThrow();
  });

  it('rejects a malformed, non-URL string', () => {
    expect(() => parseRepoUrl('not a url at all')).toThrow();
  });
});
