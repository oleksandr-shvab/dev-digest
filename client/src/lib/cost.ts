/**
 * Shared USD-cost formatter for the three cost-visibility surfaces (PR list
 * COST column, Agent Runs timeline, run trace drawer Stats). One function so
 * all three render numbers identically — see client/specs/cost-visibility.md.
 */

/**
 * USD cost, or "—" when unknown (never null runs read $0.00). Trims to at
 * most 4 decimals, padded back to at least 2 — reproduces every value in the
 * design ($0.014, $0.041, $0.003, $0.0013, $0.06) with one rule.
 */
export function formatUsd(v: number | null | undefined): string {
  if (v == null) return "—";
  if (v === 0) return "$0.00";
  if (v < 0.0001) return "<$0.0001";
  const fixed = v.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
  const [whole, frac = ""] = fixed.split(".");
  return `$${whole}.${frac.padEnd(2, "0")}`;
}
