import type { CSSProperties } from "react";

/** Co-located styles for DraftPreview. */
export const s = {
  wrap: { padding: 24 } satisfies CSSProperties,
  trust: {
    display: "flex",
    gap: 10,
    alignItems: "flex-start",
    padding: "12px 14px",
    borderRadius: 8,
    background: "var(--warn-bg)",
    border: "1px solid var(--warn)",
    color: "var(--text-primary)",
    fontSize: 13,
    lineHeight: 1.5,
    marginBottom: 20,
  } satisfies CSSProperties,
  trustIcon: { color: "var(--warn)", flexShrink: 0, marginTop: 2 } satisfies CSSProperties,
  fileRow: { display: "flex", alignItems: "center", gap: 10, marginBottom: 18 } satisfies CSSProperties,
  fileName: { fontSize: 13, flex: 1, color: "var(--text-secondary)" } satisfies CSSProperties,
  bodyHead: { display: "flex", alignItems: "center", gap: 8 } satisfies CSSProperties,
  tokens: { fontSize: 12, color: "var(--text-muted)", marginLeft: 8 } satisfies CSSProperties,
  bodyBox: {
    maxHeight: 240,
    overflow: "auto",
    padding: "12px 14px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    fontSize: 13,
  } satisfies CSSProperties,
  raw: { margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 12.5, lineHeight: 1.55 } satisfies CSSProperties,
  section: { marginTop: 4, marginBottom: 16 } satisfies CSSProperties,
  sectionTitle: { fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 8 } satisfies CSSProperties,
  list: { margin: 0, paddingLeft: 18, fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.7 } satisfies CSSProperties,
  error: { color: "var(--crit)" } satisfies CSSProperties,
} as const;
