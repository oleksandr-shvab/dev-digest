import type { CSSProperties } from "react";

/** Co-located styles for the agent SkillRow. */
export const s = {
  row: (dragging: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    borderBottom: "1px solid var(--border)",
    background: dragging ? "var(--bg-hover)" : "var(--bg-elevated)",
    position: "relative",
    zIndex: dragging ? 2 : undefined,
    boxShadow: dragging ? "var(--shadow-modal)" : undefined,
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
  name: (muted: boolean): CSSProperties => ({
    fontSize: 13,
    fontWeight: 600,
    color: muted ? "var(--text-muted)" : "var(--text-primary)",
    textDecoration: "none",
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  }),
  spacer: { flex: 1 } satisfies CSSProperties,
  unlink: (visible: boolean): CSSProperties => ({ opacity: visible ? 1 : 0, transition: "opacity .12s" }),
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
} as const;
