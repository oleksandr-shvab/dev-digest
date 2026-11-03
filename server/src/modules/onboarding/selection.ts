import { CRITICAL_PATHS_MAX, EXCLUDED_PATH_PATTERNS, READING_PATH_MAX } from './constants.js';

/**
 * Pure file selection for the tour. The repo index — not the model — chooses
 * which files appear in Critical paths and the Guided reading path (AC-9, AC-10).
 */

export interface SelectionInput {
  /** Dependency chains from the index, each root → imported file. */
  chains: readonly (readonly string[])[];
  /** Top files by rank, best first. */
  ranked: readonly string[];
  /** Regular-file paths of the commit the index was built from. */
  exists: ReadonlySet<string>;
}

/** True for a source file worth showing a newcomer (no tests, configs, migrations, generated code). */
export function isTourCandidatePath(path: string): boolean {
  const probe = `/${path.toLowerCase()}`;
  return !EXCLUDED_PATH_PATTERNS.some((pattern) => probe.includes(pattern));
}

function keepCandidates(paths: Iterable<string>, exists: ReadonlySet<string>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const path of paths) {
    if (seen.has(path)) continue;
    seen.add(path);
    if (exists.has(path) && isTourCandidatePath(path)) out.push(path);
  }
  return out;
}

export function pickCriticalFiles({ chains, ranked, exists }: SelectionInput): {
  source: 'critical_paths' | 'file_rank';
  paths: string[];
} {
  const rankOf = new Map<string, number>();
  ranked.forEach((path, i) => {
    if (!rankOf.has(path)) rankOf.set(path, i);
  });

  const fromChains = keepCandidates(chains.flat(), exists);
  if (fromChains.length > 0) {
    // Array.prototype.sort is stable, so unranked files keep their first-seen order.
    const sorted = [...fromChains].sort(
      (a, b) => (rankOf.get(a) ?? Infinity) - (rankOf.get(b) ?? Infinity),
    );
    return { source: 'critical_paths', paths: sorted.slice(0, CRITICAL_PATHS_MAX) };
  }
  return {
    source: 'file_rank',
    paths: keepCandidates(ranked, exists).slice(0, CRITICAL_PATHS_MAX),
  };
}

export function pickReadingPath({ chains, ranked, exists }: SelectionInput): string[] {
  const ordered = [...chains.flat(), ...ranked];
  return keepCandidates(ordered, exists).slice(0, READING_PATH_MAX);
}
