import { SEVERITY_RANK } from './constants.js';
import type { AlertCandidate, AlertRule, AlertSeverity } from './types.js';
import { countBySeverity, severityBucket } from '../incidents/stats.js';

export function bucketForPull(severities: AlertSeverity[]): AlertSeverity | null {
  return severityBucket(countBySeverity(severities));
}

export function matchRules(rules: AlertRule[], candidate: AlertCandidate): AlertRule[] {
  return rules.filter(
    (rule) =>
      !rule.muted && SEVERITY_RANK[candidate.severity] >= SEVERITY_RANK[rule.minSeverity],
  );
}
