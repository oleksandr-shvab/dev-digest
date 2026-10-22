import type { CSSProperties } from "react";

/** Co-located styles for BlastRadiusCard. The box matches IntentCard's `card`. */
export const s = {
  card: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    padding: 18,
  } satisfies CSSProperties,
  stats: {
    display: "flex",
    flexWrap: "wrap",
    gap: 20,
    listStyle: "none",
    margin: "0 0 16px",
    padding: 0,
  } satisfies CSSProperties,
  stat: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 14,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  statValue: { fontWeight: 700, color: "var(--text-primary)" } satisfies CSSProperties,
  actions: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  groups: { display: "flex", flexDirection: "column", gap: 12 } satisfies CSSProperties,
  empty: { fontSize: 14, color: "var(--text-muted)", margin: 0 } satisfies CSSProperties,
  error: { fontSize: 14, color: "var(--crit)" } satisfies CSSProperties,
} as const;
