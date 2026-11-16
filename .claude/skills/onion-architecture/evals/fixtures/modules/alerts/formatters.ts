import type { AlertCandidate, AlertRule } from './types.js';

const SEVERITY_LABEL = {
  info: 'FYI',
  warning: 'Needs attention',
  critical: 'Blocking',
} as const;

export function formatAlert(candidate: AlertCandidate): string {
  const label = SEVERITY_LABEL[candidate.severity];
  const noun = candidate.findingCount === 1 ? 'finding' : 'findings';
  return `[${label}] ${candidate.prTitle}: ${candidate.findingCount} ${noun} from ${candidate.agentName}`;
}

export function dedupeKeyFor(rule: AlertRule, candidate: AlertCandidate): string {
  return [rule.id, candidate.prId, candidate.agentName, candidate.severity].join(':');
}
