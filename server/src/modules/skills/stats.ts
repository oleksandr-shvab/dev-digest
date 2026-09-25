import type { SkillStats, SkillStatsSummary } from '@devdigest/shared';
import { STATS_WINDOW_DAYS } from './constants.js';

/**
 * Pure ratio / `null` rules for skill stats (spec "Stats definitions").
 * The SQL that produces the raw counts lives in the repository; nothing here
 * touches the DB. Stats are correlation, not attribution (Decision 11).
 */

/** Raw counts for one skill, as aggregated by the repository. */
export interface SkillStatCounts {
  /** `agent_skills` rows for the skill (any enabled state). */
  usedBy: number;
  /** Done runs in the window that applied the skill (`run_skills`). */
  appliedRuns: number;
  /** All done runs in the window of the agents that currently link the skill. */
  linkedAgentRuns: number;
  /** Findings in the runs that applied the skill. */
  findings: number;
  accepted: number;
  dismissed: number;
}

/** Zero counts (a skill with no data). */
export const EMPTY_COUNTS: SkillStatCounts = {
  usedBy: 0,
  appliedRuns: 0,
  linkedAgentRuns: 0,
  findings: 0,
  accepted: 0,
  dismissed: 0,
};

/** `numerator / denominator`, or `null` when the denominator is 0. Clamped to 0..1. */
export function ratio(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.min(1, Math.max(0, numerator / denominator));
}

/** pull_rate = runs that applied the skill / all runs of agents linking it. */
export function pullRate(appliedRuns: number, linkedAgentRuns: number): number | null {
  return ratio(appliedRuns, linkedAgentRuns);
}

/** accept_rate = accepted / (accepted + dismissed); `null` when nothing was triaged. */
export function acceptRate(accepted: number, dismissed: number): number | null {
  return ratio(accepted, accepted + dismissed);
}

export function buildSummary(c: SkillStatCounts): SkillStatsSummary {
  return {
    used_by: c.usedBy,
    pull_rate: pullRate(c.appliedRuns, c.linkedAgentRuns),
    accept_rate: acceptRate(c.accepted, c.dismissed),
  };
}

/** Start of the stats window (inclusive) relative to `now`. */
export function windowStart(now: Date, days = STATS_WINDOW_DAYS): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

export function buildStats(
  counts: SkillStatCounts,
  agents: SkillStats['agents'],
  byCategory: SkillStats['by_category'],
): SkillStats {
  return {
    ...buildSummary(counts),
    window_days: STATS_WINDOW_DAYS,
    findings: counts.findings,
    agents,
    // desc by count, then category for a stable order
    by_category: [...byCategory].sort(
      (a, b) => b.count - a.count || a.category.localeCompare(b.category),
    ),
  };
}
