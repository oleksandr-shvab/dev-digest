import type { IntentSource } from '@devdigest/shared';
import { MAX_PR_DESCRIPTION_CHARS } from '../prompt.js';

/**
 * Finds what a PR description points at: issues of the PR's own repository,
 * repo-relative plan/spec documents, and links that are never fetched.
 *
 * Pure: it only parses text. The description is author-controlled, so the input
 * is capped, every regular expression is linear, URLs are classified with
 * `new URL()` and an exact host comparison, and a path that could leave the
 * repository is never returned as a document.
 */

export const MAX_ISSUE_REFERENCES = 3;
export const MAX_DOCUMENT_REFERENCES = 3;
export const MAX_EXTERNAL_LINKS = 5;

const MAX_EXTERNAL_REF_CHARS = 200;
const DOCUMENT_EXTENSIONS = ['.md', '.mdx', '.txt', '.rst'];

export interface PrReferences {
  /** Issue numbers of the PR's own repository, in order of appearance. */
  issues: number[];
  /** Repo-relative document paths, safe to request, in order of appearance. */
  documents: string[];
  /** References that were found but must not be fetched, with the reason. */
  unavailable: IntentSource[];
}

interface RepoIdentity {
  owner: string;
  name: string;
  /** Branch names that may precede the path in a `/blob/<ref>/<path>` URL. */
  refs: string[];
}

// `![alt](url)` or `![alt](url "title")` — a URL inside one is not a reference.
const IMAGE_SPAN = /!\[[^\]\n]*\]\([^)\s]*(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/g;
const URL_SPAN = /https?:\/\/[^\s)\]>"'`]+/g;
const QUALIFIED_ISSUE = /(?<![\w./#-])([A-Za-z0-9][A-Za-z0-9-]{0,38})\/([A-Za-z0-9._-]{1,100})#(\d{1,7})(?!\w)/g;
const BARE_ISSUE = /(?<![^\s([,:])#(\d{1,7})(?!\w)/g;
const DOCUMENT_TOKEN =
  /(?<![^\s([{<"'`])((?:\.?\/)?(?:[\w.-]+\/)*[\w.-]+\.(?:md|mdx|txt|rst))(?=$|[\s)\]}>"'`.,;:!?])/gi;

interface Positioned<T> {
  pos: number;
  value: T;
}

interface IssueRef {
  owner: string;
  name: string;
  number: number;
}

const sameRepo = (owner: string, name: string, repo: RepoIdentity): boolean =>
  owner.toLowerCase() === repo.owner.toLowerCase() && name.toLowerCase() === repo.name.toLowerCase();

const blank = (match: string): string => ' '.repeat(match.length);

const hasDocumentExtension = (path: string): boolean => {
  const lower = path.toLowerCase();
  return DOCUMENT_EXTENSIONS.some((ext) => lower.endsWith(ext));
};

function trimTrailingPunctuation(url: string): string {
  let end = url.length;
  while (end > 0 && '.,;:!?'.includes(url.charAt(end - 1))) end--;
  return url.slice(0, end);
}

/** A path is safe only when every segment is a plain name — no `.`, `..` or empty segment. */
function isSafeDocumentPath(path: string): boolean {
  if (path.length === 0 || path.includes('\\')) return false;
  for (let i = 0; i < path.length; i++) {
    if (path.charCodeAt(i) < 0x20 || path.charCodeAt(i) === 0x7f) return false;
  }
  return path.split('/').every((s) => s !== '' && s !== '.' && s !== '..');
}

/** Strip the branch name from the part of a blob URL after `/blob/`. */
function stripRef(rest: string, refs: string[]): string | null {
  const byLength = [...refs].sort((a, b) => b.length - a.length);
  for (const ref of byLength) {
    if (ref.length > 0 && rest.startsWith(`${ref}/`)) return rest.slice(ref.length + 1);
  }
  const slash = rest.indexOf('/');
  return slash === -1 ? null : rest.slice(slash + 1);
}

type UrlClass =
  | { kind: 'issue'; issue: IssueRef }
  | { kind: 'document'; path: string }
  | { kind: 'external'; ref: string }
  | { kind: 'invalid' };

function classifyUrl(raw: string, repo: RepoIdentity): UrlClass {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { kind: 'invalid' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { kind: 'invalid' };

  const external: UrlClass = {
    kind: 'external',
    // origin + path only: no credentials, query or fragment
    ref: `${url.origin}${url.pathname}`.slice(0, MAX_EXTERNAL_REF_CHARS),
  };
  const host = url.hostname.toLowerCase();
  if (host !== 'github.com' && host !== 'www.github.com') return external;

  const segments = url.pathname.split('/').slice(1);
  const [owner, name, section] = segments;
  if (!owner || !name) return external;

  if (section === 'issues') {
    const number = segments[3];
    const trailing = segments.slice(4).every((s) => s === '');
    if (number !== undefined && /^\d{1,7}$/.test(number) && trailing) {
      return { kind: 'issue', issue: { owner, name, number: Number(number) } };
    }
    return external;
  }

  if (section === 'blob' && sameRepo(owner, name, repo)) {
    let rest: string;
    try {
      rest = decodeURIComponent(segments.slice(3).join('/'));
    } catch {
      return { kind: 'document', path: '..' }; // undecodable → unsafe, recorded as unavailable
    }
    const path = stripRef(rest, repo.refs);
    if (path !== null && hasDocumentExtension(path)) return { kind: 'document', path };
  }
  return external;
}

function stripLeadingRelative(path: string): string {
  if (path.startsWith('./')) return path.slice(2);
  if (path.startsWith('/')) return path.slice(1);
  return path;
}

/** Keep the first occurrence of each key, preserving order. */
function uniqueBy<T>(items: Positioned<T>[], key: (v: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of [...items].sort((a, b) => a.pos - b.pos)) {
    const k = key(item.value);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item.value);
  }
  return out;
}

export function parsePrReferences(description: string, repo: RepoIdentity): PrReferences {
  // (a) cap the input, (b) drop Markdown image embeds. Spans are blanked, not
  // removed, so every later position still refers to the capped description.
  let text = description.slice(0, MAX_PR_DESCRIPTION_CHARS).replace(IMAGE_SPAN, blank);

  // (c) classify every URL, then blank it out of the text
  const ownIssues: Positioned<IssueRef>[] = [];
  const otherIssues: Positioned<IssueRef>[] = [];
  const documents: Positioned<string>[] = [];
  const externalLinks: Positioned<string>[] = [];

  const addIssue = (pos: number, issue: IssueRef): void => {
    (sameRepo(issue.owner, issue.name, repo) ? ownIssues : otherIssues).push({ pos, value: issue });
  };

  for (const m of text.matchAll(URL_SPAN)) {
    const pos = m.index ?? 0;
    const cls = classifyUrl(trimTrailingPunctuation(m[0]), repo);
    if (cls.kind === 'issue') addIssue(pos, cls.issue);
    else if (cls.kind === 'document') documents.push({ pos, value: cls.path });
    else if (cls.kind === 'external') externalLinks.push({ pos, value: cls.ref });
  }
  text = text.replace(URL_SPAN, blank);

  // (d) `<owner>/<repo>#<N>` and bare `#<N>` — the closing keywords need no
  // pattern of their own: the reference after them matches these forms.
  for (const m of text.matchAll(QUALIFIED_ISSUE)) {
    addIssue(m.index ?? 0, { owner: m[1] ?? '', name: m[2] ?? '', number: Number(m[3]) });
  }
  for (const m of text.matchAll(BARE_ISSUE)) {
    addIssue(m.index ?? 0, { owner: repo.owner, name: repo.name, number: Number(m[1]) });
  }

  // (f) repo-relative document paths in the URL-free text
  for (const m of text.matchAll(DOCUMENT_TOKEN)) {
    documents.push({ pos: m.index ?? 0, value: stripLeadingRelative(m[1] ?? '') });
  }

  const unavailable: IntentSource[] = [];

  // (e) issues of other repositories are recorded, never fetched
  for (const issue of uniqueBy(otherIssues, (i) => `${i.owner}/${i.name}#${i.number}`.toLowerCase())) {
    unavailable.push({
      kind: 'issue',
      ref: `${issue.owner}/${issue.name}#${issue.number}`,
      status: 'unavailable',
      detail: 'Issue is in another repository — not fetched',
    });
  }

  // (g) own-repository issues: first of each number, first three kept (i)
  const issueNumbers = uniqueBy(ownIssues, (i) => String(i.number)).map((i) => i.number);
  const issues = issueNumbers.slice(0, MAX_ISSUE_REFERENCES);
  for (const n of issueNumbers.slice(MAX_ISSUE_REFERENCES)) {
    unavailable.push({
      kind: 'issue',
      ref: `${repo.owner}/${repo.name}#${n}`,
      status: 'unavailable',
      detail: `More than ${MAX_ISSUE_REFERENCES} issue references — not fetched`,
    });
  }

  // (h) an unsafe path never becomes a document and takes no slot; (g)/(i) the
  // first three safe documents are kept
  const documentPaths = uniqueBy(documents, (p) => p);
  const safeDocuments: string[] = [];
  for (const path of documentPaths) {
    if (isSafeDocumentPath(path)) {
      safeDocuments.push(path);
    } else {
      unavailable.push({
        kind: 'document',
        ref: path.slice(0, MAX_EXTERNAL_REF_CHARS),
        status: 'unavailable',
        detail: 'Path leaves the repository',
      });
    }
  }
  for (const path of safeDocuments.slice(MAX_DOCUMENT_REFERENCES)) {
    unavailable.push({
      kind: 'document',
      ref: path,
      status: 'unavailable',
      detail: `More than ${MAX_DOCUMENT_REFERENCES} document references — not read`,
    });
  }

  // (j) external links: recorded as unavailable, first five kept, the rest counted
  const links = uniqueBy(externalLinks, (r) => r);
  for (const ref of links.slice(0, MAX_EXTERNAL_LINKS)) {
    unavailable.push({
      kind: 'external_link',
      ref,
      status: 'unavailable',
      detail: 'External link — not fetched',
    });
  }
  if (links.length > MAX_EXTERNAL_LINKS) {
    unavailable.push({
      kind: 'external_link',
      ref: `+${links.length - MAX_EXTERNAL_LINKS} more links`,
      status: 'unavailable',
      detail: 'External link — not fetched',
    });
  }

  return { issues, documents: safeDocuments.slice(0, MAX_DOCUMENT_REFERENCES), unavailable };
}
