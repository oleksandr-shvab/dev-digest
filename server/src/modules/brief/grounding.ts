import type { PrBrief } from '@devdigest/shared';
import {
  FOCUS_REASON_MAX_CHARS,
  MAX_FOCUS,
  MAX_RISKS,
  RISK_EXPLANATION_MAX_CHARS,
  RISK_TITLE_MAX_CHARS,
  SUMMARY_MAX_CHARS,
} from './constants.js';
import { capText } from './facts.js';
import type { BriefGeneration } from './prompt.js';

/**
 * Grounding of the model answer. Paths and lines are untrusted claims: a path
 * counts only when it is a changed file or a blast-radius file, a line only
 * when it falls inside a finding range the model was given (AC-7, AC-17, AC-18).
 * Invalid entries go first, then the caps apply in model order (AC-39).
 */

export interface GroundInput {
  generation: BriefGeneration;
  /** Keyed by every changed path; the value is its first changed line or null. */
  firstLines: Map<string, number | null>;
  /** Files of changed symbols and callers, from the untrimmed blast radius. */
  blastFiles: Set<string>;
  /** Finding ranges per file, from the facts the model saw. */
  givenLines: Map<string, [number, number][]>;
}

function normalizePath(path: string): string {
  return path.trim().replace(/^(?:\.\/|\/)+/, '');
}

export function groundBrief({ generation, firstLines, blastFiles, givenLines }: GroundInput): PrBrief {
  const isValid = (path: string) => firstLines.has(path) || blastFiles.has(path);

  const risks: PrBrief['risks'] = [];
  for (const risk of generation.risks) {
    const fileRefs = [...new Set(risk.files.map(normalizePath).filter(isValid))];
    if (fileRefs.length === 0) continue;
    risks.push({
      kind: risk.kind,
      title: capText(risk.title, RISK_TITLE_MAX_CHARS),
      explanation: capText(risk.explanation, RISK_EXPLANATION_MAX_CHARS),
      severity: risk.severity,
      file_refs: fileRefs,
    });
  }

  const focus: PrBrief['review_focus'] = [];
  for (const item of generation.review_focus) {
    const file = normalizePath(item.file);
    if (!isValid(file)) continue;
    focus.push({
      file,
      line: firstLines.has(file) ? groundLine(item.line, givenLines.get(file), firstLines.get(file) ?? null) : null,
      reason: capText(item.reason, FOCUS_REASON_MAX_CHARS),
    });
  }

  return {
    summary: capText(generation.summary, SUMMARY_MAX_CHARS),
    risks: risks.slice(0, MAX_RISKS),
    review_focus: focus.slice(0, MAX_FOCUS),
  };
}

/** The cited line when it lies inside a given range, otherwise the first changed line. */
function groundLine(
  cited: number | null,
  ranges: [number, number][] | undefined,
  firstChanged: number | null,
): number | null {
  if (cited !== null && ranges?.some(([start, end]) => cited >= start && cited <= end)) return cited;
  return firstChanged;
}
