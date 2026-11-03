import picomatch from 'picomatch';
import type {
  GitTreeEntry,
  ProjectContextDocStatus,
  ProjectContextDocType,
} from '@devdigest/shared';
import { EXCLUDED_SEGMENTS, REGULAR_FILE_MODES } from './constants.js';

/** One attached doc as read for a run. `text` is set only while it is still usable. */
export interface CollectedDoc {
  path: string;
  tokens: number;
  status: ProjectContextDocStatus;
  text?: string;
}

export type DocMatcher = (path: string) => boolean;

const DOC_TYPES: readonly ProjectContextDocType[] = ['specs', 'docs', 'insights'];

/** A readable doc: regular file (not symlink/submodule), `.md`, outside `.git`/`node_modules`. */
export function isEligibleEntry(entry: GitTreeEntry): boolean {
  if (!(REGULAR_FILE_MODES as readonly string[]).includes(entry.mode)) return false;
  if (!entry.path.toLowerCase().endsWith('.md')) return false;
  return entry.path
    .split('/')
    .every((segment) => !(EXCLUDED_SEGMENTS as readonly string[]).includes(segment));
}

export function compileGlobs(globs: string[]): DocMatcher {
  return picomatch(globs, { dot: true });
}

/** Eligible entries that match the globs, sorted by path. */
export function selectDocs(entries: GitTreeEntry[], matcher: DocMatcher): GitTreeEntry[] {
  return entries
    .filter((e) => isEligibleEntry(e) && matcher(e.path))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/** The folder nearest the file among specs/docs/insights; `docs` when none matches. */
export function docTypeFor(path: string): ProjectContextDocType {
  const folders = path.split('/').slice(0, -1);
  for (let i = folders.length - 1; i >= 0; i--) {
    const folder = folders[i] as ProjectContextDocType;
    if (DOC_TYPES.includes(folder)) return folder;
  }
  return 'docs';
}

/** Strict UTF-8 decode; `null` when the bytes are not valid UTF-8. */
export function decodeUtf8(buf: Buffer): string | null {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return null;
  }
}

/** Own paths first, then each enabled skill's paths in the given order; first occurrence wins. */
export function orderAttachedPaths(own: string[], perSkill: string[][]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of [own, ...perSkill]) {
    for (const path of list) {
      if (seen.has(path)) continue;
      seen.add(path);
      out.push(path);
    }
  }
  return out;
}

/**
 * Walk docs in order against a token budget. A doc that would exceed what is
 * left is skipped whole (never truncated) and the walk continues with the next
 * one. `missing` docs cost nothing and stay `missing`.
 */
export function planBudget(docs: CollectedDoc[], budget: number): CollectedDoc[] {
  let used = 0;
  return docs.map((doc) => {
    if (doc.status === 'missing') return doc;
    if (used + doc.tokens > budget) {
      const { text: _text, ...rest } = doc;
      return { ...rest, status: 'skipped_budget' as const };
    }
    used += doc.tokens;
    return { ...doc, status: 'included' as const };
  });
}

/** Distinct agents per path, attached directly or through an enabled skill link. */
export function countUsedBy(
  agents: { id: string; contextPaths: string[] }[],
  links: { agentId: string; contextPaths: string[] }[],
): Map<string, number> {
  const usersByPath = new Map<string, Set<string>>();
  const add = (agentId: string, paths: string[]) => {
    for (const path of paths) {
      let users = usersByPath.get(path);
      if (!users) usersByPath.set(path, (users = new Set()));
      users.add(agentId);
    }
  };
  for (const a of agents) add(a.id, a.contextPaths);
  for (const l of links) add(l.agentId, l.contextPaths);
  return new Map([...usersByPath].map(([path, users]) => [path, users.size]));
}
