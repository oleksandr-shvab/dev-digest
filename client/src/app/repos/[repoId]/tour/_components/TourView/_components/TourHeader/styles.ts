import type { CSSProperties } from "react";

/** Co-located styles for TourHeader. */
export const s = {
  wrap: { marginBottom: 20 } satisfies CSSProperties,
  top: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 } satisfies CSSProperties,
  title: { fontSize: 20, fontWeight: 700, margin: 0 } satisfies CSSProperties,
  accent: { color: "var(--accent-text)" } satisfies CSSProperties,
  subtitle: { fontSize: 13, color: "var(--text-muted)", margin: "6px 0 0" } satisfies CSSProperties,
  actions: { display: "flex", alignItems: "center", gap: 8, flexShrink: 0, flexWrap: "wrap" } satisfies CSSProperties,
  notices: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: 10 } satisfies CSSProperties,
  notice: {
    fontSize: 12.5,
    padding: "3px 9px",
    borderRadius: 6,
    border: "1px solid var(--border)",
    background: "var(--bg-hover)",
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  error: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: 12,
    borderRadius: 7,
    background: "var(--crit-bg)",
    color: "var(--crit)",
    fontSize: 13,
    marginTop: 12,
  } satisfies CSSProperties,
} as const;
