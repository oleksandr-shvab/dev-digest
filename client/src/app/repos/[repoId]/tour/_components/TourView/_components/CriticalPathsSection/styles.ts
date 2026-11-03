import type { CSSProperties } from "react";

/** Co-located styles for CriticalPathsSection. */
export const s = {
  rank: { fontSize: 12, color: "var(--text-muted)", margin: "0 0 8px" } satisfies CSSProperties,
  list: { margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 8 } satisfies CSSProperties,
  row: { display: "flex", alignItems: "center", gap: 8, fontSize: 13 } satisfies CSSProperties,
  icon: { flexShrink: 0, color: "var(--text-muted)" } satisfies CSSProperties,
  path: { color: "var(--text-primary)", wordBreak: "break-all" } satisfies CSSProperties,
  note: { color: "var(--text-secondary)" } satisfies CSSProperties,
  open: {
    marginLeft: "auto",
    flexShrink: 0,
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    fontSize: 12.5,
    color: "var(--accent-text)",
  } satisfies CSSProperties,
} as const;
