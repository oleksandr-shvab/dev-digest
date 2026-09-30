import type { CSSProperties } from "react";

/** Co-located styles for ConventionsView. */
export const s = {
  pageHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
    marginBottom: 20,
  } satisfies CSSProperties,
  pageTitle: { fontSize: 20, fontWeight: 700, margin: 0 } satisfies CSSProperties,
  pageSubtitle: { fontSize: 13, color: "var(--text-muted)", margin: "6px 0 0" } satisfies CSSProperties,
  count: { fontSize: 12.5, color: "var(--text-secondary)", margin: "6px 0 0" } satisfies CSSProperties,
  headerActions: { display: "flex", gap: 8, flexShrink: 0 } satisfies CSSProperties,
  filters: { display: "flex", gap: 8, marginBottom: 16 } satisfies CSSProperties,
  error: {
    padding: 12,
    borderRadius: 7,
    background: "var(--crit-bg)",
    color: "var(--crit)",
    fontSize: 13,
    marginBottom: 16,
  } satisfies CSSProperties,
} as const;
