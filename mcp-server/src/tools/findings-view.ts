import type { FindingRecord, Severity } from '@devdigest/shared';
import * as z from 'zod/v4';
import { sanitizeText, TEXT_CAPS } from './shared.js';
import type { ResponseFormat } from './shared.js';

/** Most severe first. `satisfies` keeps this list in step with the vendored `Severity` contract. */
export const SEVERITIES = ['CRITICAL', 'WARNING', 'SUGGESTION'] as const satisfies readonly Severity[];
export const severitySchema = z.enum(SEVERITIES);

export const SEVERITY_RANK: Record<Severity, number> = { CRITICAL: 3, WARNING: 2, SUGGESTION: 1 };

/** File paths come from LLM output too; this is a generous cap for a real path. */
const FILE_MAX_CHARS = 300;

export type Triage = 'open' | 'accepted' | 'dismissed';

/** One finding as the agent sees it: no finding, review or PR ids (BP-06). */
export interface FindingItem {
  severity: Severity;
  category: string;
  title: string;
  file: string;
  start_line: number;
  end_line: number;
  confidence: number;
  triage: Triage;
  kind?: string;
  rationale?: string;
  suggestion?: string;
}

/** Severity descending, then file, then start line, so a page always starts with what matters most. */
export function sortFindings(findings: readonly FindingRecord[]): FindingRecord[] {
  return [...findings].sort(
    (a, b) =>
      (SEVERITY_RANK[b.severity] ?? 0) - (SEVERITY_RANK[a.severity] ?? 0) ||
      a.file.localeCompare(b.file) ||
      a.start_line - b.start_line,
  );
}

/** Counts findings the user has not dismissed. */
export function countBySeverity(findings: readonly FindingRecord[]): Record<Severity, number> {
  const counts: Record<Severity, number> = { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
  for (const finding of findings) {
    if (finding.dismissed_at) continue;
    if (finding.severity in counts) counts[finding.severity] += 1;
  }
  return counts;
}

function triageOf(finding: FindingRecord): Triage {
  if (finding.dismissed_at) return 'dismissed';
  if (finding.accepted_at) return 'accepted';
  return 'open';
}

export function toFindingItem(finding: FindingRecord, format: ResponseFormat): FindingItem {
  const item: FindingItem = {
    severity: finding.severity,
    category: finding.category,
    title: sanitizeText(finding.title, TEXT_CAPS.title) ?? '',
    file: sanitizeText(finding.file, FILE_MAX_CHARS) ?? '',
    start_line: finding.start_line,
    end_line: finding.end_line,
    confidence: Math.round(finding.confidence * 100) / 100,
    triage: triageOf(finding),
  };
  if (format === 'concise') return item;

  const rationale = sanitizeText(finding.rationale, TEXT_CAPS.rationale);
  const suggestion = sanitizeText(finding.suggestion, TEXT_CAPS.suggestion);
  return {
    ...item,
    ...(finding.kind ? { kind: finding.kind } : {}),
    ...(rationale ? { rationale } : {}),
    ...(suggestion ? { suggestion } : {}),
  };
}
