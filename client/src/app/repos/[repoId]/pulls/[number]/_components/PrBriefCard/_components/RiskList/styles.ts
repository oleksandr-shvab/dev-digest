import type { CSSProperties } from "react";

/** Co-located styles for RiskList. */
export const s = {
  section: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  heading: {
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.07em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    margin: 0,
  } satisfies CSSProperties,
  list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  row: {
    border: "1px solid var(--border)",
    borderRadius: 6,
    padding: "8px 10px",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  top: { display: "flex", alignItems: "center", gap: 8 } satisfies CSSProperties,
  title: { flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
  explanation: {
    fontSize: 13,
    color: "var(--text-secondary)",
    lineHeight: 1.5,
    margin: "8px 0 0",
    whiteSpace: "pre-wrap",
  } satisfies CSSProperties,
  files: { display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 } satisfies CSSProperties,
  fileBtn: {
    fontSize: 12,
    color: "var(--accent-text)",
    background: "var(--accent-bg)",
    border: "1px solid transparent",
    borderRadius: 4,
    padding: "2px 6px",
    cursor: "pointer",
  } satisfies CSSProperties,
  chevronBtn: {
    display: "inline-flex",
    background: "transparent",
    border: "none",
    padding: 2,
    cursor: "pointer",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
} as const;

export function severityLabelFor(color: string, bg: string): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    fontSize: 12,
    fontWeight: 600,
    color,
    background: bg,
    borderRadius: 4,
    padding: "2px 6px",
    flexShrink: 0,
  };
}

export function chevronFor(open: boolean): CSSProperties {
  return { transform: open ? "rotate(90deg)" : "none", transition: "transform .12s" };
}
