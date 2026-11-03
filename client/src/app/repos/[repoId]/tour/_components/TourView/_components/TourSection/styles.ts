import type { CSSProperties } from "react";

/** Co-located styles for TourSection. */
export const s = {
  card: {
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    marginBottom: 16,
    scrollMarginTop: 16,
  } satisfies CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: "12px var(--card-pad, 16px)",
  } satisfies CSSProperties,
  heading: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    margin: 0,
    fontSize: 15,
    fontWeight: 650,
    color: "var(--text-primary)",
    outline: "none",
  } satisfies CSSProperties,
  toggle: {
    display: "inline-grid",
    placeItems: "center",
    width: 28,
    height: 28,
    borderRadius: 6,
    border: "1px solid transparent",
    background: "transparent",
    color: "var(--text-secondary)",
    cursor: "pointer",
  } satisfies CSSProperties,
  body: { padding: "0 var(--card-pad, 16px) var(--card-pad, 16px)" } satisfies CSSProperties,
} as const;
