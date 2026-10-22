import type { BlastDegradedReason } from "@devdigest/shared";
import type { IconName } from "@devdigest/ui";
import type { BlastCounts } from "./helpers";

/** Summary row, in display order. `labelKey` resolves under the `blast` namespace. */
export const SUMMARY_STATS: readonly { key: keyof BlastCounts; icon: IconName; labelKey: string }[] = [
  { key: "symbols", icon: "Code", labelKey: "stat.symbols" },
  { key: "callers", icon: "Users", labelKey: "stat.callers" },
  { key: "endpoints", icon: "Globe", labelKey: "stat.endpoints" },
  { key: "crons", icon: "Clock", labelKey: "stat.crons" },
];

/** Badge label key per degraded reason. A local runtime mirror of the reason list
    (client/insights.md 2026-09-25: no runtime import from @devdigest/shared) —
    `tsc` fails if a reason is missing or extra. */
export const DEGRADED_BADGE_KEY: Record<BlastDegradedReason, string> = {
  flag_off: "badge.flag_off",
  index_failed: "badge.index_failed",
  index_partial: "badge.index_partial",
  repo_too_large: "badge.repo_too_large",
  no_data: "badge.no_data",
};
