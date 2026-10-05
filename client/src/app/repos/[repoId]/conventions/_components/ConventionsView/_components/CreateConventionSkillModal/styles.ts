import type { CSSProperties } from "react";

/** Co-located styles for CreateConventionSkillModal. */
export const s = {
  body: { display: "flex", flexDirection: "column" } satisfies CSSProperties,
  explainer: {
    fontSize: 13,
    color: "var(--text-secondary)",
    lineHeight: 1.5,
    marginBottom: 18,
  } satisfies CSSProperties,
  note: { fontSize: 12, color: "var(--text-muted)", marginTop: 8 } satisfies CSSProperties,
  agentList: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    maxHeight: 160,
    overflowY: "auto",
    padding: 10,
    border: "1px solid var(--border)",
    borderRadius: 7,
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  error: { fontSize: 13, color: "var(--crit)" } satisfies CSSProperties,
  footer: { display: "flex", justifyContent: "flex-end", gap: 8 } satisfies CSSProperties,
} as const;
