import type { CSSProperties } from "react";

/** Co-located styles for the agent ContextTab. */
export const s = {
  footer: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  warn: {
    fontSize: 13,
    color: "var(--warn)",
    background: "var(--warn-bg)",
    borderRadius: 7,
    padding: "8px 12px",
  } satisfies CSSProperties,
} as const;
