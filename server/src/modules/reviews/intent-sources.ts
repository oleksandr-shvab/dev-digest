import type { GitHubClient, IntentSource, RepoRef, UnifiedDiff } from '@devdigest/shared';
import {
  changedFilesOutline,
  parsePrReferences,
  type IntentMaterials,
} from '@devdigest/reviewer-core';
import type { PullRow } from './repository.js';
import { INTENT_MAX_DOCUMENT_BYTES } from './constants.js';

/**
 * Collects what the intent classifier may read: the PR title and description,
 * the issues and documents the description references, and the changed-files
 * outline. Every source is recorded as `used` or `unavailable` with a FIXED
 * `detail` — a missing source is never papered over.
 *
 * Only the PR's own repository is ever requested, through the injected
 * (authenticated) GitHub port: no URL, owner or repository name taken from the
 * PR text reaches a request. Error messages from the HTTP client are never
 * stored, returned or logged — they may carry request details — so each failure
 * maps to a fixed string below.
 */

type PullInput = Pick<PullRow, 'number' | 'title' | 'body' | 'headSha' | 'branch' | 'base'>;

function errorStatus(err: unknown): number | undefined {
  return (err as { status?: number } | null)?.status;
}

function issueFailureDetail(err: unknown): string {
  const status = errorStatus(err);
  if (status === 404 || status === 410) return 'Issue not found';
  if (status === 401 || status === 403) return 'No access to this issue';
  return 'Could not be fetched from GitHub';
}

const DOCUMENT_REASON_DETAIL = {
  not_found: 'File not found at the PR head commit',
  not_regular_file: 'Not a regular file',
  too_large: 'File is too large',
  invalid_path: 'Path leaves the repository',
} as const;

const NO_TOKEN_DETAIL = 'GitHub token is not configured';

export async function collectIntentSources(
  deps: { github: () => Promise<GitHubClient> },
  input: { pull: PullInput; repo: RepoRef; diff: UnifiedDiff },
): Promise<{ materials: IntentMaterials; sources: IntentSource[] }> {
  const { pull, repo, diff } = input;
  const description = pull.body ?? '';
  const prRef = `#${pull.number}`;
  const hasDescription = description.trim().length > 0;

  const refs = parsePrReferences(description, {
    owner: repo.owner,
    name: repo.name,
    refs: [pull.branch, pull.base],
  });

  // The client is resolved once, and only when there is something to fetch.
  let github: GitHubClient | null = null;
  if (refs.issues.length + refs.documents.length > 0) {
    try {
      github = await deps.github();
    } catch {
      github = null;
    }
  }

  const issueResults = await Promise.all(
    refs.issues.map(async (n): Promise<{ source: IntentSource; issue?: IntentMaterials['issues'][number] }> => {
      const ref = `${repo.owner}/${repo.name}#${n}`;
      if (!github) {
        return { source: { kind: 'issue', ref, status: 'unavailable', detail: NO_TOKEN_DETAIL } };
      }
      try {
        // Always the PR's own repository, never an owner/name taken from the PR text.
        const meta = await github.getIssue(repo, n);
        return {
          source: { kind: 'issue', ref, status: 'used' },
          issue: { ref, title: meta.title, body: meta.body ?? null },
        };
      } catch (err) {
        return {
          source: { kind: 'issue', ref, status: 'unavailable', detail: issueFailureDetail(err) },
        };
      }
    }),
  );

  const documentResults = await Promise.all(
    refs.documents.map(
      async (path): Promise<{ source: IntentSource; document?: IntentMaterials['documents'][number] }> => {
        if (!github) {
          return {
            source: { kind: 'document', ref: path, status: 'unavailable', detail: NO_TOKEN_DETAIL },
          };
        }
        try {
          const res = await github.getFileAtCommit(repo, pull.headSha, path, INTENT_MAX_DOCUMENT_BYTES);
          if (res.ok) {
            return {
              source: { kind: 'document', ref: path, status: 'used' },
              document: { ref: path, content: res.content },
            };
          }
          return {
            source: {
              kind: 'document',
              ref: path,
              status: 'unavailable',
              detail: DOCUMENT_REASON_DETAIL[res.reason],
            },
          };
        } catch {
          return {
            source: {
              kind: 'document',
              ref: path,
              status: 'unavailable',
              detail: 'Could not be read from GitHub',
            },
          };
        }
      },
    ),
  );

  const outline = changedFilesOutline(diff);

  const sources: IntentSource[] = [
    { kind: 'pr_title', ref: prRef, status: 'used' },
    hasDescription
      ? { kind: 'pr_description', ref: prRef, status: 'used' }
      : { kind: 'pr_description', ref: prRef, status: 'unavailable', detail: 'PR description is empty' },
    ...issueResults.map((r) => r.source),
    ...documentResults.map((r) => r.source),
    ...refs.unavailable,
    outline.text.length > 0
      ? { kind: 'changed_files', ref: `${outline.files + outline.omitted} file(s)`, status: 'used' }
      : {
          kind: 'changed_files',
          ref: '0 file(s)',
          status: 'unavailable',
          detail: 'No changed files available',
        },
  ];

  const unavailableReferences = sources.filter(
    (s) =>
      s.status === 'unavailable' &&
      (s.kind === 'issue' || s.kind === 'document' || s.kind === 'external_link'),
  );

  const materials: IntentMaterials = {
    title: pull.title,
    description: pull.body,
    issues: issueResults.flatMap((r) => (r.issue ? [r.issue] : [])),
    documents: documentResults.flatMap((r) => (r.document ? [r.document] : [])),
    unavailable: unavailableReferences,
    changedFiles: outline.text,
  };

  return { materials, sources };
}
