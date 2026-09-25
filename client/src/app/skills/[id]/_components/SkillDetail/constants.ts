import type { IconName } from "@devdigest/ui";

export interface DetailTab {
  key: string;
  /** Resolves under `skills.tabs.`. */
  labelKey: string;
  icon: IconName;
}

/** Detail tabs (Config · Preview · Evals · Stats · Versions). The active one lives in ?tab=. */
export const TABS: readonly DetailTab[] = [
  { key: "config", labelKey: "config", icon: "Settings" },
  { key: "preview", labelKey: "preview", icon: "Eye" },
  { key: "evals", labelKey: "evals", icon: "FlaskConical" },
  { key: "stats", labelKey: "stats", icon: "BarChart" },
  { key: "versions", labelKey: "versions", icon: "History" },
];

export const DEFAULT_TAB = "config";
export const VALID_TABS: readonly string[] = TABS.map((tb) => tb.key);
