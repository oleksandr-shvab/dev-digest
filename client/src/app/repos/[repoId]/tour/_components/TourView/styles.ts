import type { CSSProperties } from "react";

/** Co-located styles for TourView. */
export const s = {
  layout: { display: "grid", gridTemplateColumns: "190px minmax(0, 1fr)", gap: 24, alignItems: "start" } satisfies CSSProperties,
  announce: { fontSize: 12.5, color: "var(--ok, var(--text-secondary))", minHeight: 18, marginBottom: 8 } satisfies CSSProperties,
  srOnly: {
    position: "absolute",
    width: 1,
    height: 1,
    overflow: "hidden",
    clip: "rect(0 0 0 0)",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
} as const;
