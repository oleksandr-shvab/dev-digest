import type { CSSProperties } from "react";

/** Co-located styles for IntentCard. The box matches OverviewTab's `descriptionBox`. */
export const s = {
  card: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    padding: 18,
  } satisfies CSSProperties,
  actions: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  stale: {
    fontSize: 13,
    color: "var(--text-secondary)",
    marginBottom: 12,
  } satisfies CSSProperties,
  sentence: {
    fontSize: 15,
    fontWeight: 600,
    color: "var(--text-primary)",
    lineHeight: 1.5,
    margin: "0 0 16px",
  } satisfies CSSProperties,
  scopeGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 18,
    marginBottom: 16,
  } satisfies CSSProperties,
  columnTitle: {
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.07em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    marginBottom: 6,
  } satisfies CSSProperties,
  list: {
    margin: 0,
    paddingLeft: 18,
    fontSize: 14,
    color: "var(--text-secondary)",
    lineHeight: 1.55,
  } satisfies CSSProperties,
  none: { fontSize: 14, color: "var(--text-muted)" } satisfies CSSProperties,
  meta: { fontSize: 12, color: "var(--text-muted)", marginTop: 12 } satisfies CSSProperties,
  error: { fontSize: 14, color: "var(--crit)" } satisfies CSSProperties,
} as const;
