import type { CSSProperties } from "react";

/** Co-located styles for the ContextDocPicker. */
export const s = {
  wrap: { maxWidth: 760 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 12, marginBottom: 6, flexWrap: "wrap" } satisfies CSSProperties,
  h2: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
  filter: {
    marginLeft: "auto",
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 10px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    width: 220,
  } satisfies CSSProperties,
  filterIcon: { color: "var(--text-muted)" } satisfies CSSProperties,
  filterInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    background: "transparent",
    border: "none",
    outline: "none",
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  helper: { fontSize: 13, color: "var(--text-secondary)", margin: "0 0 14px", lineHeight: 1.5 } satisfies CSSProperties,
  notice: {
    fontSize: 13,
    color: "var(--text-secondary)",
    background: "var(--bg-hover)",
    borderRadius: 7,
    padding: "8px 12px",
    marginBottom: 12,
  } satisfies CSSProperties,
  list: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    marginBottom: 14,
  } satisfies CSSProperties,
  muted: { fontSize: 13, color: "var(--text-muted)", padding: "14px 16px" } satisfies CSSProperties,
  status: { fontSize: 12.5, color: "var(--text-muted)", minHeight: 18, marginBottom: 6 } satisfies CSSProperties,
  error: { fontSize: 13, color: "var(--crit)" } satisfies CSSProperties,
  footer: { fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
