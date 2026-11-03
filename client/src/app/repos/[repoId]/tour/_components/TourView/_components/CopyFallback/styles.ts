import type { CSSProperties } from "react";

/** Co-located styles for CopyFallback. */
export const s = {
  wrap: { display: "flex", alignItems: "center", gap: 8, marginBottom: 16 } satisfies CSSProperties,
  input: {
    flex: 1,
    minWidth: 0,
    padding: "7px 10px",
    borderRadius: 6,
    border: "1px solid var(--border-strong)",
    background: "var(--bg-elevated)",
    color: "var(--text-primary)",
    fontSize: 12.5,
  } satisfies CSSProperties,
} as const;
