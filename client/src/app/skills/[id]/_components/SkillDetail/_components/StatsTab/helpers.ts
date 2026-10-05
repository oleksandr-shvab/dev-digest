import type { DonutSegment } from "@devdigest/ui";
import type { SkillStats } from "@devdigest/shared";
import { CATEGORY_COLORS } from "./constants";

/** Map `by_category` rows (already desc by count) to coloured Donut segments. */
export function toSegments(byCategory: SkillStats["by_category"]): DonutSegment[] {
  return byCategory.map((c, i) => ({
    label: c.category,
    value: c.count,
    color: CATEGORY_COLORS[i % CATEGORY_COLORS.length] ?? "var(--info)",
  }));
}
