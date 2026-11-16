import { ALERT_THRESHOLDS } from '../alerts/constants.js';
import type { AlertSeverity } from '../alerts/types.js';

export interface IncidentCounts {
  info: number;
  warning: number;
  critical: number;
}

export function countBySeverity(severities: AlertSeverity[]): IncidentCounts {
  const counts: IncidentCounts = { info: 0, warning: 0, critical: 0 };
  for (const severity of severities) counts[severity] += 1;
  return counts;
}

export function severityBucket(counts: IncidentCounts): AlertSeverity | null {
  if (counts.critical >= ALERT_THRESHOLDS.critical) return 'critical';
  if (counts.warning >= ALERT_THRESHOLDS.warning) return 'warning';
  if (counts.info >= ALERT_THRESHOLDS.info) return 'info';
  return null;
}

export function trend(previous: IncidentCounts, current: IncidentCounts): number {
  const total = (c: IncidentCounts) => c.info + c.warning * 3 + c.critical * 10;
  return total(current) - total(previous);
}
