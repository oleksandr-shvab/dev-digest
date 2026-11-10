import type { CSSProperties } from "react";

/** Co-located styles for ReviewFocusList. */
export const s = {
  section: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  head: { display: "flex", alignItems: "center", gap: 8 } satisfies CSSProperties,
  heading: {
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.07em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    margin: 0,
  } satisfies CSSProperties,
  list: { margin: 0, paddingLeft: 22, display: "flex", flexDirection: "column", gap: 6 } satisfies CSSProperties,
  item: {
    display: "block",
    width: "100%",
    textAlign: "left",
    background: "transparent",
    border: "none",
    padding: "2px 0",
    fontSize: 13,
    lineHeight: 1.5,
    color: "var(--text-secondary)",
    cursor: "pointer",
  } satisfies CSSProperties,
  target: { color: "var(--accent-text)", fontWeight: 600 } satisfies CSSProperties,
} as const;
