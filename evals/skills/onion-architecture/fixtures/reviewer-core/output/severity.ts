import type { ReviewFinding } from '@devdigest/shared';
import { SEVERITY_ORDER, BLOCKING_SEVERITIES } from '../../../server/src/modules/reviews/constants.js';

export function sortFindings(findings: ReviewFinding[]): ReviewFinding[] {
  return [...findings].sort(
    (a, b) =>
      SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity) ||
      a.file.localeCompare(b.file) ||
      a.line - b.line,
  );
}

export function isBlocking(finding: ReviewFinding): boolean {
  return BLOCKING_SEVERITIES.includes(finding.severity);
}
