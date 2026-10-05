import type { IntentConfidence } from "@devdigest/shared";

/** Per-confidence badge colours. `labelKey` resolves under `brief.intent.confidence`. */
export const CONFIDENCE_META: Record<
  IntentConfidence,
  { labelKey: string; color: string; bg: string }
> = {
  high: { labelKey: "high", color: "var(--ok)", bg: "var(--ok-bg)" },
  medium: { labelKey: "medium", color: "var(--info)", bg: "var(--info-bg)" },
  low: { labelKey: "low", color: "var(--crit)", bg: "var(--crit-bg)" },
};
