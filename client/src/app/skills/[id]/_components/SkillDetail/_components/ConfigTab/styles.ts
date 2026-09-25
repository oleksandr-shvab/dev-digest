import type { CSSProperties } from "react";

/** Co-located styles for the skill ConfigTab. */
export const s = {
  wrap: { maxWidth: 820 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 10, marginBottom: 20 } satisfies CSSProperties,
  h2: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
  enabledLabel: {
    marginLeft: "auto",
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  imported: {
    display: "flex",
    gap: 10,
    alignItems: "flex-start",
    padding: "12px 14px",
    borderRadius: 8,
    background: "var(--warn-bg)",
    border: "1px solid var(--warn)",
    fontSize: 13,
    lineHeight: 1.5,
    marginBottom: 20,
  } satisfies CSSProperties,
  importedIcon: { color: "var(--warn)", flexShrink: 0, marginTop: 2 } satisfies CSSProperties,
  error: { color: "var(--crit)" } satisfies CSSProperties,
  footer: {
    position: "sticky",
    bottom: -28,
    margin: "0 -28px -28px",
    padding: "14px 28px",
    background: "var(--bg-surface)",
    borderTop: "1px solid var(--border)",
    display: "flex",
    flexDirection: "column",
    gap: 12,
  } satisfies CSSProperties,
  banner: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 13,
    color: "var(--warn)",
  } satisfies CSSProperties,
  actions: { display: "flex", gap: 10 } satisfies CSSProperties,
} as const;
