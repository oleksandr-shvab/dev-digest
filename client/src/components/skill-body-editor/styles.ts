import type { CSSProperties } from "react";
import { EDITOR_HEIGHT, LINE_HEIGHT_PX } from "./constants";

const text = { fontSize: 13, lineHeight: `${LINE_HEIGHT_PX}px`, padding: "10px 0" } satisfies CSSProperties;

/** Co-located styles for SkillBodyEditor. */
export const s = {
  wrap: (error: boolean): CSSProperties => ({
    border: "1px solid " + (error ? "var(--crit)" : "var(--border-strong)"),
    borderRadius: 7,
    background: "var(--bg-elevated)",
    overflow: "hidden",
  }),
  bar: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 12px",
    borderBottom: "1px solid var(--border)",
    background: "var(--bg-surface)",
    fontSize: 12.5,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  fileName: { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } satisfies CSSProperties,
  tokens: { color: "var(--text-muted)" } satisfies CSSProperties,
  body: { display: "flex", height: EDITOR_HEIGHT } satisfies CSSProperties,
  gutter: {
    ...text,
    width: 46,
    flexShrink: 0,
    overflow: "hidden",
    textAlign: "right",
    paddingRight: 10,
    color: "var(--text-muted)",
    background: "var(--bg-surface)",
    borderRight: "1px solid var(--border)",
    userSelect: "none",
  } satisfies CSSProperties,
  textarea: {
    ...text,
    flex: 1,
    minWidth: 0,
    paddingLeft: 12,
    paddingRight: 12,
    border: "none",
    outline: "none",
    resize: "none",
    overflow: "auto",
    whiteSpace: "pre",
    background: "transparent",
    color: "var(--text-primary)",
  } satisfies CSSProperties,
} as const;
