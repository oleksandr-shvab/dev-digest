import type { CSSProperties } from "react";

/** Co-located styles for ConventionCard. */
export const s = {
  card: {
    padding: 14,
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    marginBottom: 10,
  } satisfies CSSProperties,
  headerRow: { display: "flex", alignItems: "center", gap: 8, marginBottom: 8 } satisfies CSSProperties,
  spacer: { flex: 1 } satisfies CSSProperties,
  rule: { fontSize: 14, margin: "0 0 10px", lineHeight: 1.45, color: "var(--text-primary)" } satisfies CSSProperties,
  editBlock: { display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 } satisfies CSSProperties,
  // Mirrors @devdigest/ui's kit Textarea visually — a plain element here so it can carry aria-label.
  textarea: {
    width: "100%",
    resize: "vertical",
    padding: "10px 12px",
    borderRadius: 7,
    border: "1px solid var(--border-strong)",
    background: "var(--bg-elevated)",
    color: "var(--text-primary)",
    fontSize: 14,
    lineHeight: 1.55,
    outline: "none",
  } satisfies CSSProperties,
  evidence: { display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 } satisfies CSSProperties,
  path: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  snippet: {
    display: "block",
    fontSize: 12.5,
    padding: "6px 8px",
    borderRadius: 6,
    background: "var(--bg-surface)",
    color: "var(--text-secondary)",
    overflowX: "auto",
    whiteSpace: "pre",
  } satisfies CSSProperties,
  actions: { display: "flex", alignItems: "center", gap: 8 } satisfies CSSProperties,
} as const;
