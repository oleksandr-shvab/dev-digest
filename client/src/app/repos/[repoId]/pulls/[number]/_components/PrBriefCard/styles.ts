import type { CSSProperties } from "react";

/** Co-located styles for PrBriefCard. The box matches IntentCard's. */
export const s = {
  card: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    padding: 18,
    display: "flex",
    flexDirection: "column",
    gap: 14,
  } satisfies CSSProperties,
  /** Visually hidden, still announced: the polite live region. */
  srOnly: {
    position: "absolute",
    width: 1,
    height: 1,
    margin: -1,
    padding: 0,
    overflow: "hidden",
    clip: "rect(0 0 0 0)",
    whiteSpace: "nowrap",
    border: 0,
  } satisfies CSSProperties,
  error: { fontSize: 14, color: "var(--crit)" } satisfies CSSProperties,
  muted: { fontSize: 14, color: "var(--text-secondary)", margin: 0 } satisfies CSSProperties,
  stale: { fontSize: 13, color: "var(--warn)" } satisfies CSSProperties,
  summary: {
    fontSize: 15,
    color: "var(--text-primary)",
    lineHeight: 1.55,
    margin: 0,
    whiteSpace: "pre-wrap",
  } satisfies CSSProperties,
  note: { fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 } satisfies CSSProperties,
  noteTitle: { fontWeight: 600, marginRight: 6 } satisfies CSSProperties,
  alert: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    fontSize: 13,
    color: "var(--crit)",
    background: "var(--crit-bg)",
    borderRadius: 6,
    padding: "8px 12px",
  } satisfies CSSProperties,
  notInDiff: { fontSize: 13, color: "var(--warn)" } satisfies CSSProperties,
  meta: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
} as const;
