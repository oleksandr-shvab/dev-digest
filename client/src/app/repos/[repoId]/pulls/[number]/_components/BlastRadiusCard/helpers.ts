import type { BlastRadius } from "@devdigest/shared";

export interface BlastCounts {
  symbols: number;
  callers: number;
  endpoints: number;
  crons: number;
}

/** Counts shown in the summary row. The twin of `countBlast` in
    `server/src/modules/blast/helpers.ts` — same rules; the UI never parses `summary`.
    A caller reaching several symbols counts once (distinct file + name), and an
    endpoint or cron attributed to several groups counts once (distinct string). */
export function countBlast(blast: Pick<BlastRadius, "changed_symbols" | "downstream">): BlastCounts {
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
