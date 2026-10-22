import type { BlastDegradedReason, BlastRadius, DownstreamImpact } from '@devdigest/shared';
import type { BlastResult, DegradedReason, IndexStatus } from '../repo-intel/types.js';

/**
 * Pure helpers for the blast module — the facade's flat `BlastResult` mapped to
 * the shared `BlastRadius` contract, and the counts behind its `summary`. No I/O.
 */

export interface BlastCounts {
  symbols: number;
  callers: number;
  endpoints: number;
  crons: number;
}

/**
 * Counting rules: `symbols` is the changed-symbol count; `callers` are distinct
 * (file, name) pairs across all groups; `endpoints` and `crons` are distinct
 * strings across all groups.
 */
export function countBlast(
  blast: Pick<BlastRadius, 'changed_symbols' | 'downstream'>,
): BlastCounts {
  const callers = new Set<string>();
  const endpoints = new Set<string>();
  const crons = new Set<string>();
  for (const group of blast.downstream) {
    for (const c of group.callers) callers.add(JSON.stringify([c.file, c.name]));
    for (const e of group.endpoints_affected) endpoints.add(e);
    for (const c of group.crons_affected) crons.add(c);
  }
  return {
    symbols: blast.changed_symbols.length,
    callers: callers.size,
    endpoints: endpoints.size,
    crons: crons.size,
  };
}

/** Distinct values of `values`, in first-seen order. */
function distinct(values: Iterable<string>): string[] {
  return [...new Set(values)];
}

/**
 * The indexer reads an endpoint registered in a loop as its source text
 * (`POST /findings/:id/${action}`); show the placeholder like a route param.
 */
function endpointLabel(endpoint: string): string {
  return endpoint.replace(/\$\{(\w+)\}/g, ':$1');
}

/**
 * Map the facade's flat result to the `BlastRadius` contract.
 *
 * - `downstream` groups callers by `viaSymbol`, in order of first appearance
 *   (the facade sorts callers by rank, so this is rank order).
 * - A caller in the declaring file of its `viaSymbol` is dropped.
 * - A `partial` index the facade called healthy is reported as degraded.
 */
export function toBlastRadius(result: BlastResult, indexStatus: IndexStatus): BlastRadius {
  const changed_symbols = result.changedSymbols.map(({ name, file, kind }) => ({
    name,
    file,
    kind,
  }));

  const declaringFiles = new Map<string, Set<string>>();
  for (const s of result.changedSymbols) {
    const files = declaringFiles.get(s.name) ?? new Set<string>();
    files.add(s.file);
    declaringFiles.set(s.name, files);
  }

  const seen = new Set<string>();
  const bySymbol = new Map<string, BlastResult['callers']>();
  for (const row of result.callers) {
    if (declaringFiles.get(row.viaSymbol)?.has(row.file)) continue;
    const key = JSON.stringify([row.viaSymbol, row.file, row.symbol]);
    if (seen.has(key)) continue;
    seen.add(key);
    const rows = bySymbol.get(row.viaSymbol) ?? [];
    rows.push(row);
    bySymbol.set(row.viaSymbol, rows);
  }

  const downstream: DownstreamImpact[] = [...bySymbol].map(([symbol, rows]) => {
    const files = distinct(rows.map((r) => r.file));
    return {
      symbol,
      callers: rows.map((r) => ({ name: r.symbol, file: r.file, line: r.line })),
      endpoints_affected: distinct(
        files.flatMap((f) => (result.factsByFile?.[f]?.endpoints ?? []).map(endpointLabel)),
      ),
      crons_affected: distinct(files.flatMap((f) => result.factsByFile?.[f]?.crons ?? [])),
    };
  });

  const c = countBlast({ changed_symbols, downstream });
  const summary = `symbols: ${c.symbols}, callers: ${c.callers}, endpoints: ${c.endpoints}, crons: ${c.crons}`;

  const blast: BlastRadius = { changed_symbols, downstream, summary, degraded: result.degraded === true };
  if (indexStatus === 'partial' && result.degraded !== true) {
    blast.degraded = true;
    blast.reason = 'index_partial';
  } else if (result.degraded === true && result.reason) {
    blast.reason = result.reason;
  }
  return blast;
}

// `pnpm typecheck` fails here if repo-intel's `DegradedReason` and the contract's `BlastDegradedReason` stop being the same set.
// It lives in `src/` because `server/tsconfig.json` does not compile `test/`.
type SameReasons = [DegradedReason] extends [BlastDegradedReason]
  ? [BlastDegradedReason] extends [DegradedReason]
    ? true
    : false
  : false;
export const REASONS_MATCH: SameReasons = true;
