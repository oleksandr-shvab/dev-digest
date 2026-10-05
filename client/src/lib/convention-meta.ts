/* convention-meta.ts — display metadata for the Conventions page: category
   order/labels (mirrors server/src/modules/conventions/constants.ts). */
import type { ConventionCategory } from "@devdigest/shared";

export const CONVENTION_CATEGORIES: readonly ConventionCategory[] = [
  "naming",
  "structure",
  "imports",
  "typing",
  "error-handling",
  "testing",
  "formatting",
  "other",
];

export const CONVENTION_CATEGORY_LABEL: Record<ConventionCategory, string> = {
  naming: "Naming",
  structure: "Structure",
  imports: "Imports",
  typing: "Typing",
  "error-handling": "Error handling",
  testing: "Testing",
  formatting: "Formatting",
  other: "Other",
};

/** Confidence colour: green ≥ 80%, amber ≥ 50%, otherwise red (client spec). */
export function confidenceColor(confidence: number): string {
  if (confidence >= 0.8) return "var(--ok)";
  if (confidence >= 0.5) return "var(--warn)";
  return "var(--crit)";
}
