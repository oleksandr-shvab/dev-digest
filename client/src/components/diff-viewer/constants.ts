/** Constants for the DiffViewer. */
import type { FindingRecord } from "@devdigest/shared";

/** Files with this many or fewer changed lines start expanded. */
export const AUTO_EXPAND_MAX_LINES = 200;

/** Matches a unified-diff hunk header, e.g. `@@ -1,2 +1,3 @@`. */
export const HUNK_HEADER_RE = /@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

/** Lower is more severe. */
export const SEVERITY_RANK: Record<FindingRecord["severity"], number> = {
  CRITICAL: 0,
  WARNING: 1,
  SUGGESTION: 2,
};

/** Severity → i18n key (prReview namespace) of the label shown on a finding's line. */
export const LINE_LABEL_KEY: Record<FindingRecord["severity"], string> = {
  CRITICAL: "smartDiff.lineLabel.CRITICAL",
  WARNING: "smartDiff.lineLabel.WARNING",
  SUGGESTION: "smartDiff.lineLabel.SUGGESTION",
};
