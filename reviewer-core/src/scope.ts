import type { Finding } from '@devdigest/shared';

/**
 * Scope gate — drops findings the reviewer marked `out_of_scope` for the PR's
 * intent, but never a CRITICAL one: a serious problem outside the PR's scope
 * must still leave a signal.
 *
 * Deterministic: it looks only at the `scope` enum value and `severity`, never
 * at intent text (which is model output built from untrusted PR text).
 */

export interface ScopeGateResult {
  kept: Finding[];
  dropped: { finding: Finding; reason: string }[];
}

export function dropOutOfScopeFindings(findings: Finding[]): ScopeGateResult {
  const kept: Finding[] = [];
  const dropped: ScopeGateResult['dropped'] = [];
  for (const finding of findings) {
    if (finding.scope === 'out_of_scope' && finding.severity !== 'CRITICAL') {
      dropped.push({
        finding,
        reason: `out of scope for this PR (severity ${finding.severity})`,
      });
    } else {
      kept.push(finding);
    }
  }
  return { kept, dropped };
}
