import type { CSSProperties } from "react";

/** Co-located styles for DiffTab (layout only). */
export const s = {
  controls: { display: "flex", alignItems: "center", gap: 8 } satisfies CSSProperties,
  reviewNotRun: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  groups: { display: "flex", flexDirection: "column", gap: 12 } satisfies CSSProperties,
} as const;
