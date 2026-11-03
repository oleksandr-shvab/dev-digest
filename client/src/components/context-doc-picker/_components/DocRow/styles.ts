import type { CSSProperties } from "react";

/** Co-located styles for a picker row. */
export const s = {
  row: (dragging: boolean, muted: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    borderBottom: "1px solid var(--border)",
    background: dragging ? "var(--bg-hover)" : "var(--bg-elevated)",
    position: "relative",
    zIndex: dragging ? 2 : undefined,
    boxShadow: dragging ? "var(--shadow-modal)" : undefined,
    opacity: muted ? 0.75 : 1,
  }),
  handle: (disabled: boolean): CSSProperties => ({
    display: "inline-grid",
    placeItems: "center",
    padding: 2,
    border: "none",
    background: "transparent",
    color: "var(--text-muted)",
    cursor: disabled ? "not-allowed" : "grab",
    opacity: disabled ? 0.4 : 1,
    touchAction: "none",
  }),
  handleSpacer: { width: 20, flexShrink: 0 } satisfies CSSProperties,
  names: { display: "flex", alignItems: "baseline", gap: 8, minWidth: 0, flex: 1 } satisfies CSSProperties,
  file: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-primary)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  folder: { fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" } satisfies CSSProperties,
  notFound: { fontSize: 12, color: "var(--warn)", whiteSpace: "nowrap" } satisfies CSSProperties,
  tokens: { fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" } satisfies CSSProperties,
  // Screen-reader-only text for the checkbox's accessible name.
  srOnly: {
    position: "absolute",
    width: 1,
    height: 1,
    margin: -1,
    overflow: "hidden",
    clip: "rect(0 0 0 0)",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  readOnlyDot: { width: 16, flexShrink: 0 } satisfies CSSProperties,
} as const;
