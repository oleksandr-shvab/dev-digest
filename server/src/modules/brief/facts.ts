import type { BlastRadius, SmartDiffRole } from '@devdigest/shared';
import { classifyFile } from '../reviews/smart-diff/classify.js';
import {
  BLAST_UNAVAILABLE_REASONS,
  FINDING_TITLE_MAX_CHARS,
  INTENT_ITEM_MAX_CHARS,
  INTENT_MAX_ITEMS,
  INTENT_STATEMENT_MAX_CHARS,
  SEVERITY_RANK,
  SEVERITY_RANK_OTHER,
} from './constants.js';

/**
 * The precomputed facts one brief is written from (AC-16). Pure data: nothing
 * here carries diff code, so nothing downstream can leak it to the model.
 */

export interface FileFact {
  path: string;
  role: SmartDiffRole;
  additions: number;
  deletions: number;
}

export interface IntentFact {
  statement: string;
  inScope: string[];
  outOfScope: string[];
  confidence: string;
}

export interface BlastFact {
  summary: string;
  endpoints: number;
  crons: number;
  callers: { file: string; line: number; symbol: string }[];
}

export interface IssueFact {
  ref: string;
  title: string;
  body: string | null;
}

export interface SpecFact {
  path: string;
  text: string;
}

export interface FindingFact {
  file: string;
  startLine: number;
  endLine: number;
  severity: string;
  title: string;
}

export interface BriefFacts {
  pr: { title: string; description: string | null };
  intent: IntentFact | null;
  blast: BlastFact | null;
  files: FileFact[];
  issues: IssueFact[];
  specs: SpecFact[];
  findings: FindingFact[];
}

export function capText(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) : s;
}

/** Roles from the path only; the patch is read nowhere in this function. */
export function toFileFacts(
  rows: { path: string; additions: number; deletions: number; patch?: string | null }[],
): FileFact[] {
  return rows
    .map((r) => ({
      path: r.path,
      role: classifyFile(r.path),
      additions: r.additions,
      deletions: r.deletions,
    }))
    .sort(
      (a, b) =>
        b.additions + b.deletions - (a.additions + a.deletions) || a.path.localeCompare(b.path),
    );
}

/** A stale intent still counts as available. */
export function toIntentFact(
  row:
    | { intent: string; inScope: string[]; outOfScope: string[]; confidence: string }
    | undefined,
): IntentFact | null {
  if (!row) return null;
  const items = (list: string[]) =>
    list.slice(0, INTENT_MAX_ITEMS).map((s) => capText(s, INTENT_ITEM_MAX_CHARS));
  return {
    statement: capText(row.intent, INTENT_STATEMENT_MAX_CHARS),
    inScope: items(row.inScope),
    outOfScope: items(row.outOfScope),
    confidence: row.confidence,
  };
}

/** `null` when the blast radius is unavailable (AC-6). Callers keep their rank order. */
export function toBlastFact(blast: BlastRadius): BlastFact | null {
  if (blast.reason && BLAST_UNAVAILABLE_REASONS.has(blast.reason)) return null;
  const endpoints = new Set<string>();
  const crons = new Set<string>();
  const callers: BlastFact['callers'] = [];
  for (const group of blast.downstream) {
    for (const e of group.endpoints_affected) endpoints.add(e);
    for (const c of group.crons_affected) crons.add(c);
    for (const c of group.callers) callers.push({ file: c.file, line: c.line, symbol: c.name });
  }
  return { summary: blast.summary, endpoints: endpoints.size, crons: crons.size, callers };
}

/** Files of the changed symbols plus every caller, from the untrimmed blast. */
export function blastFiles(blast: BlastRadius): Set<string> {
  const files = new Set<string>();
  for (const s of blast.changed_symbols) files.add(s.file);
  for (const group of blast.downstream) for (const c of group.callers) files.add(c.file);
  return files;
}

/** Undismissed findings, most severe first, then by file and line. */
export function toFindingFacts(
  rows: {
    file: string;
    startLine: number;
    endLine: number;
    severity: string;
    title: string;
    dismissedAt: Date | null;
  }[],
): FindingFact[] {
  const rank = (s: string) => SEVERITY_RANK[s] ?? SEVERITY_RANK_OTHER;
  return rows
    .filter((r) => r.dismissedAt === null)
    .map((r) => ({
      file: r.file,
      startLine: r.startLine,
      endLine: r.endLine,
      severity: r.severity,
      title: capText(r.title, FINDING_TITLE_MAX_CHARS),
    }))
    .sort(
      (a, b) =>
        rank(a.severity) - rank(b.severity) ||
        a.file.localeCompare(b.file) ||
        a.startLine - b.startLine,
    );
}

const HUNK_HEADER = /@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

/**
 * New-side number of the first added line; for a deletion-only patch, the
 * new-side start of the first hunk; `null` without a patch or for a deleted
 * file, which has no new side (AC-17, AC-18).
 */
export function firstChangedLine(patch: string | null | undefined): number | null {
  if (!patch) return null;
  let firstHunkStart: number | null = null;
  let newNo = 0;
  let inHunk = false;
  for (const line of patch.split('\n')) {
    const header = HUNK_HEADER.exec(line);
    if (line.startsWith('@@') && header) {
      newNo = Number(header[2]);
      if (firstHunkStart === null) firstHunkStart = newNo;
      inHunk = true;
      continue;
    }
    if (!inHunk) continue;
    if (line.startsWith('+')) return newNo;
    if (line.startsWith('-') || line.startsWith('\\')) continue;
    newNo += 1;
  }
  // A new-side start of 0 is a deleted file: there is no line to cite.
  return firstHunkStart === 0 ? null : firstHunkStart;
}

/** Per file, the line ranges of the findings the model was given. */
export function givenLineRanges(findings: FindingFact[]): Map<string, [number, number][]> {
  const ranges = new Map<string, [number, number][]>();
  for (const f of findings) {
    const list = ranges.get(f.file) ?? [];
    list.push([f.startLine, f.endLine]);
    ranges.set(f.file, list);
  }
  return ranges;
}
