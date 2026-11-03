import type { CSSProperties } from "react";

/** Co-located styles for the doc preview dialog. */
export const s = {
  body: { padding: "16px 24px", fontSize: 14 } satisfies CSSProperties,
  muted: { color: "var(--text-muted)", fontSize: 13 } satisfies CSSProperties,
  error: { color: "var(--crit)", fontSize: 13 } satisfies CSSProperties,
} as const;
