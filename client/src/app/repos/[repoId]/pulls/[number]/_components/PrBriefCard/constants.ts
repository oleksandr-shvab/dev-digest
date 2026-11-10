import type { IconName } from "@devdigest/ui";
import type { RiskSeverity } from "@devdigest/shared";

/* Mirrors of the server caps (server/src/modules/brief/constants.ts). Mirrored, not
   imported: a runtime import from @devdigest/shared breaks `pnpm build` (client insights,
   2026-09-25). The server already caps the stored brief; the client re-caps so an
   oversized payload never floods the page (AC-39). */
export const MAX_RISKS = 6;
export const MAX_FOCUS = 5;

/** Per-severity visual meta. `labelKey` resolves under `brief.prBrief.severity`. */
export const SEVERITY_META: Record<
  RiskSeverity,
  { icon: IconName; color: string; bg: string; labelKey: string }
> = {
  high: { icon: "AlertOctagon", color: "var(--crit)", bg: "var(--crit-bg)", labelKey: "high" },
  medium: { icon: "AlertTriangle", color: "var(--warn)", bg: "var(--warn-bg)", labelKey: "medium" },
  low: { icon: "Info", color: "var(--info)", bg: "var(--info-bg)", labelKey: "low" },
};
