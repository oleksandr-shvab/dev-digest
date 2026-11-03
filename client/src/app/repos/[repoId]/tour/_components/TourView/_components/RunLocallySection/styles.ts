import type { CSSProperties } from "react";

/** Co-located styles for RunLocallySection. */
export const s = {
  list: { margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 8 } satisfies CSSProperties,
  row: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "6px 8px 6px 12px",
    borderRadius: 6,
    border: "1px solid var(--border)",
    background: "var(--bg-hover)",
  } satisfies CSSProperties,
  num: { fontSize: 12, color: "var(--text-muted)", minWidth: 16 } satisfies CSSProperties,
  command: {
    flex: 1,
    minWidth: 0,
    fontSize: 12.5,
    color: "var(--text-primary)",
    whiteSpace: "pre",
    overflowX: "auto",
  } satisfies CSSProperties,
} as const;
