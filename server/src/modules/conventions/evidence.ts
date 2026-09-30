import type { ConventionDropReason } from '@devdigest/shared';
import type { RepoFileSystem } from './sampling.js';
import { EVIDENCE_LINE_WINDOW } from './constants.js';

/**
 * Evidence check (Decision 5) — the code gate between "the model said so" and
 * "this candidate is shown to the user". A candidate survives only when its
 * path is one of the files actually shown to the model (`sampledPaths`) and
 * its snippet is really there, within a small line window of the cited line.
 * Re-reads the file rather than reusing the sampling-time content, so a file
 * that vanished between sampling and verification is caught as `file_missing`
 * instead of silently trusted.
 */

export interface EvidenceClaim {
  path: string;
  line: number;
  snippet: string;
}

export type EvidenceCheckReason = Extract<
  ConventionDropReason,
  'path_not_sampled' | 'file_missing' | 'snippet_not_found'
>;

export type EvidenceResult = { ok: true; line: number } | { ok: false; reason: EvidenceCheckReason };

function normalizeWhitespace(s: string): string {
  return s.trim().replace(/\s+/g, ' ');
}

/** No leading `./`; a path containing `..` will simply never be in `sampledPaths`. */
function normalizePath(path: string): string {
  return path.replace(/^\.\//, '');
}

export interface EvidenceChecker {
  verify(claim: EvidenceClaim): Promise<EvidenceResult>;
}

/**
 * `sampledPaths` is the closed set of paths actually rendered into the prompt
 * (`FileSample.path`, see sampling.ts) — the only paths a candidate may cite.
 * Reads are cached so a file cited by several candidates is read once.
 */
export function createEvidenceChecker(
  sampledPaths: ReadonlySet<string>,
  fs: Pick<RepoFileSystem, 'readFile'>,
): EvidenceChecker {
  const cache = new Map<string, Promise<string | null>>();
  const readCached = (path: string): Promise<string | null> => {
    let pending = cache.get(path);
    if (!pending) {
      pending = fs.readFile(path);
      cache.set(path, pending);
    }
    return pending;
  };

  return {
    async verify(claim: EvidenceClaim): Promise<EvidenceResult> {
      const path = normalizePath(claim.path);
      if (!sampledPaths.has(path)) return { ok: false, reason: 'path_not_sampled' };

      const content = await readCached(path);
      if (content == null) return { ok: false, reason: 'file_missing' };

      const target = normalizeWhitespace(claim.snippet);
      if (!target) return { ok: false, reason: 'snippet_not_found' };

      const lines = content.split('\n');
      const centerIdx = claim.line - 1;
      const from = Math.max(0, centerIdx - EVIDENCE_LINE_WINDOW);
      const to = Math.min(lines.length, centerIdx + EVIDENCE_LINE_WINDOW + 1);
      for (let i = from; i < to; i++) {
        if (normalizeWhitespace(lines[i] ?? '').includes(target)) return { ok: true, line: i + 1 };
      }
      return { ok: false, reason: 'snippet_not_found' };
    },
  };
}
