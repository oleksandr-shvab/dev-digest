import type { CSSProperties } from "react";

/** Co-located styles for ReadingPathSection. */
export const s = {
  list: { margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 10 } satisfies CSSProperties,
  row: { display: "flex", gap: 10, fontSize: 13 } satisfies CSSProperties,
  num: { fontSize: 12, color: "var(--text-muted)", minWidth: 16, paddingTop: 1 } satisfies CSSProperties,
  path: { color: "var(--text-primary)", wordBreak: "break-all" } satisfies CSSProperties,
  reason: { color: "var(--text-secondary)", marginTop: 2 } satisfies CSSProperties,
} as const;
