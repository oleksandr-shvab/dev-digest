import type { CSSProperties } from "react";

/** Co-located styles for DownstreamGroup. */
export const s = {
  group: {
    border: "1px solid var(--border)",
    borderRadius: 6,
    padding: 12,
  } satisfies CSSProperties,
  header: { margin: 0, fontSize: 14 } satisfies CSSProperties,
  toggle: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    width: "100%",
    padding: 0,
    background: "none",
    border: "none",
    cursor: "pointer",
    textAlign: "left",
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  symbol: { fontSize: 14, fontWeight: 700 } satisfies CSSProperties,
  count: { marginLeft: "auto", fontSize: 12, fontWeight: 500, color: "var(--text-muted)" } satisfies CSSProperties,
  callers: {
    listStyle: "none",
    margin: "10px 0 0",
    padding: 0,
    display: "flex",
    flexDirection: "column",
    gap: 4,
  } satisfies CSSProperties,
  caller: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  chips: {
    listStyle: "none",
    margin: "10px 0 0",
    padding: 0,
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
  } satisfies CSSProperties,
} as const;
