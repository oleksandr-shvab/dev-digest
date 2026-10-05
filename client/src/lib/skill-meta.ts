/* skill-meta.ts — display metadata shared by the Skills page and the agent
   editor's Skills tab: type colours/icons, source icons and rate formatting. */
import type { IconName } from "@devdigest/ui";
import type { SkillSource, SkillType } from "@devdigest/shared";

export interface SkillTypeStyle {
  color: string;
  bg: string;
  icon: IconName;
}

/** Type → chip colours (rubric blue, convention green, security red, custom neutral). */
export const SKILL_TYPE_STYLE: Record<SkillType, SkillTypeStyle> = {
  rubric: { color: "var(--accent-text)", bg: "var(--accent-bg)", icon: "ListChecks" },
  convention: { color: "var(--ok)", bg: "var(--ok-bg)", icon: "FileText" },
  security: { color: "var(--crit)", bg: "var(--crit-bg)", icon: "Shield" },
  custom: { color: "var(--text-secondary)", bg: "var(--bg-hover)", icon: "Sparkles" },
};

export const SKILL_TYPES: readonly SkillType[] = ["rubric", "convention", "security", "custom"];

/** Source → icon. `imported_url` and `imported_file` share the "Imported" label. */
export const SKILL_SOURCE_ICON: Record<SkillSource, IconName> = {
  manual: "Edit",
  extracted: "Brain",
  community: "Users",
  imported_url: "Upload",
  imported_file: "Upload",
};

/** 0..1 rate → "62%", or "—" when there is no data yet. */
export function formatRate(rate: number | null | undefined): string {
  return rate == null ? "—" : `${Math.round(rate * 100)}%`;
}

/** Accept-rate colour: green ≥ 70%, amber ≥ 50%, otherwise red; muted when unknown. */
export function acceptColor(rate: number | null | undefined): string {
  if (rate == null) return "var(--text-muted)";
  if (rate >= 0.7) return "var(--ok)";
  if (rate >= 0.5) return "var(--warn)";
  return "var(--crit)";
}

/* The two limits below mirror `SKILL_NAME_RE` / `MAX_SKILL_BODY_CHARS` in
   @devdigest/shared. They are duplicated on purpose: the client only imports
   *types* from the vendored shared copy — its `./x.js` specifiers don't resolve
   for runtime imports under Next's webpack. Keep them in sync with the contract. */
export const SKILL_NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const MAX_SKILL_BODY_CHARS = 40_000;
