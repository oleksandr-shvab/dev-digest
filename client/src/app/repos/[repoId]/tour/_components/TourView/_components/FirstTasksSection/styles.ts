import type { CSSProperties } from "react";

/** Co-located styles for FirstTasksSection. */
export const s = {
  list: { margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 12 } satisfies CSSProperties,
  task: {
    padding: 12,
    borderRadius: 6,
    border: "1px solid var(--border)",
    background: "var(--bg-hover)",
  } satisfies CSSProperties,
  title: { fontSize: 13.5, fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
  description: { fontSize: 13, color: "var(--text-secondary)", margin: "4px 0 8px" } satisfies CSSProperties,
  paths: { display: "flex", flexWrap: "wrap", gap: 6, margin: 0, padding: 0, listStyle: "none" } satisfies CSSProperties,
  path: { fontSize: 12, color: "var(--accent-text)", wordBreak: "break-all" } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)", margin: 0 } satisfies CSSProperties,
} as const;
