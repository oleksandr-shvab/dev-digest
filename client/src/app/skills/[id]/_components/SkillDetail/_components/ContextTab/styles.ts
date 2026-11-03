import type { CSSProperties } from "react";

/** Co-located styles for the skill ContextTab. */
export const s = {
  serializes: { maxWidth: 760, marginTop: 4 } satisfies CSSProperties,
  label: {
    fontSize: 11.5,
    fontWeight: 600,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    marginBottom: 6,
  } satisfies CSSProperties,
  box: {
    margin: 0,
    padding: "12px 14px",
    fontSize: 12.5,
    lineHeight: 1.6,
    color: "var(--text-primary)",
    background: "var(--code-bg)",
    border: "1px solid var(--border)",
    borderRadius: 7,
    whiteSpace: "pre-wrap",
    overflow: "auto",
  } satisfies CSSProperties,
} as const;
