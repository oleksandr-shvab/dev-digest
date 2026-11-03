import type { CSSProperties } from "react";

/** Co-located styles for OnThisPage. */
export const s = {
  nav: { position: "sticky", top: 16, alignSelf: "start", minWidth: 180 } satisfies CSSProperties,
  label: {
    fontSize: 11.5,
    fontWeight: 600,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    margin: "0 0 8px",
  } satisfies CSSProperties,
  list: { margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 2 } satisfies CSSProperties,
  item: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    width: "100%",
    padding: "5px 8px",
    borderRadius: 6,
    border: "1px solid transparent",
    background: "transparent",
    color: "var(--text-secondary)",
    fontSize: 13,
    textAlign: "left",
    cursor: "pointer",
  } satisfies CSSProperties,
  itemCurrent: { background: "var(--bg-hover)", color: "var(--text-primary)", fontWeight: 600 } satisfies CSSProperties,
  marker: { width: 8, display: "inline-block", color: "var(--accent-text)" } satisfies CSSProperties,
} as const;
