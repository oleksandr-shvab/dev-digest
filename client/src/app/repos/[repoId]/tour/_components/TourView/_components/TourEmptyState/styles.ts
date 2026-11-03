import type { CSSProperties } from "react";

/** Co-located styles for TourEmptyState. */
export const s = {
  wrap: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    textAlign: "center",
    gap: 8,
    padding: "60px 28px",
  } satisfies CSSProperties,
  icon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    display: "grid",
    placeItems: "center",
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    color: "var(--text-muted)",
    marginBottom: 8,
  } satisfies CSSProperties,
  title: { fontSize: 15, fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
  body: { fontSize: 14, color: "var(--text-secondary)", maxWidth: 420, lineHeight: 1.5 } satisfies CSSProperties,
  cta: { marginTop: 12 } satisfies CSSProperties,
} as const;
