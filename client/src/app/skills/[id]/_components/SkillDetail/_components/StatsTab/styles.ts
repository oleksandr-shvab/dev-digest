import type { CSSProperties } from "react";

/** Co-located styles for the skill StatsTab. */
export const s = {
  wrap: { maxWidth: 900 } satisfies CSSProperties,
  caption: { fontSize: 13, color: "var(--text-secondary)", marginBottom: 16 } satisfies CSSProperties,
  metrics: { display: "flex", gap: 14, marginBottom: 24 } satisfies CSSProperties,
  metricCol: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column" } satisfies CSSProperties,
  hint: { fontSize: 12, color: "var(--text-muted)", marginTop: 6 } satisfies CSSProperties,
  ringValue: { display: "inline-flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  h3: { fontSize: 14, fontWeight: 700, marginBottom: 10 } satisfies CSSProperties,
  section: { marginBottom: 24 } satisfies CSSProperties,
  agentRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    borderBottom: "1px solid var(--border)",
    fontSize: 13,
  } satisfies CSSProperties,
  agentName: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  open: { fontSize: 13, color: "var(--accent-text)", textDecoration: "none" } satisfies CSSProperties,
  muted: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  footnote: { fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 } satisfies CSSProperties,
} as const;
