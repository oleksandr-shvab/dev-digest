import type { CSSProperties } from "react";

/** Co-located styles for VersionDiffModal (uses the shared --code-* diff tokens). */
export const s = {
  body: { padding: 20 } satisfies CSSProperties,
  sectionTitle: { fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", margin: "0 0 8px" } satisfies CSSProperties,
  box: {
    border: "1px solid var(--border)",
    borderRadius: 7,
    background: "var(--code-bg)",
    overflow: "auto",
    maxHeight: 360,
    marginBottom: 18,
    fontSize: 12.5,
    lineHeight: "20px",
  } satisfies CSSProperties,
  line: (kind: "add" | "del" | "ctx"): CSSProperties => ({
    display: "flex",
    gap: 10,
    padding: "0 12px",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    background: kind === "add" ? "var(--code-add)" : kind === "del" ? "var(--code-del)" : "transparent",
    color: kind === "add" ? "var(--code-add-text)" : kind === "del" ? "var(--code-del-text)" : "var(--text-primary)",
  }),
  mark: { width: 10, flexShrink: 0, userSelect: "none" } satisfies CSSProperties,
  none: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
