/* Review-findings support for the DiffViewer (Files changed tab).
   Pure helpers + the API shape the viewer needs, mirroring comments.ts.
   Findings are persisted review findings, anchored by `start_line` on the new
   (RIGHT) side of the diff. */
import type { FindingActionKind, FindingRecord } from "@devdigest/shared";
import { SEVERITY_RANK } from "./constants";
import { lineKey } from "./comments";
import type { Line } from "./helpers";

/** What the viewer needs to show review findings inside the diff. */
export interface DiffFindingApi {
  /** Findings across all files; each FileCard filters to its own path. */
  findings: FindingRecord[];
  /** When false, only the finding cards are hidden (stripe, label and dot stay). */
  showFindings: boolean;
  pending: boolean;
  onAction: (findingId: string, action: FindingActionKind) => void;
}

/** A finding that is not dismissed. */
export function isOpenFinding(f: FindingRecord): boolean {
  return f.dismissed_at == null;
}

/**
 * Split findings into those anchored to a rendered line (keyed `RIGHT:<line>`)
 * and the rest, surfaced separately so nothing is silently dropped.
 */
export function partitionFindings(
  findings: FindingRecord[],
  renderedKeys: Set<string>,
): { matched: Map<string, FindingRecord[]>; outsideDiff: FindingRecord[] } {
  const matched = new Map<string, FindingRecord[]>();
  const outsideDiff: FindingRecord[] = [];
  for (const f of findings) {
    const key = lineKey("RIGHT", f.start_line);
    if (key && renderedKeys.has(key)) {
      const list = matched.get(key) ?? [];
      list.push(f);
      matched.set(key, list);
    } else {
      outsideDiff.push(f);
    }
  }
  return { matched, outsideDiff };
}

/** Findings anchored to a parsed line (RIGHT key of add/ctx lines only). */
export function findingsForLine(ln: Line, matched: Map<string, FindingRecord[]>): FindingRecord[] {
  if (matched.size === 0) return [];
  if (ln.kind !== "add" && ln.kind !== "ctx") return [];
  const key = lineKey("RIGHT", ln.newNo);
  return (key && matched.get(key)) || [];
}

/** The most severe open finding's severity, or null when none is open. */
export function topSeverity(findings: FindingRecord[]): FindingRecord["severity"] | null {
  let top: FindingRecord["severity"] | null = null;
  for (const f of findings) {
    if (!isOpenFinding(f)) continue;
    if (top === null || SEVERITY_RANK[f.severity] < SEVERITY_RANK[top]) top = f.severity;
  }
  return top;
}
