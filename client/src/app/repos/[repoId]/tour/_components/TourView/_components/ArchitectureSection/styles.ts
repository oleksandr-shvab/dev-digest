import type { CSSProperties } from "react";

/** Co-located styles for ArchitectureSection. */
export const s = {
  summary: { fontSize: 13.5, color: "var(--text-secondary)", marginBottom: 12 } satisfies CSSProperties,
  diagram: { marginBottom: 12 } satisfies CSSProperties,
  links: { display: "flex", flexWrap: "wrap", gap: 8, margin: 0, padding: 0, listStyle: "none" } satisfies CSSProperties,
  chip: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "3px 8px",
    borderRadius: 6,
    border: "1px solid var(--border)",
    background: "var(--bg-hover)",
    fontSize: 12.5,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  chipPath: { color: "var(--accent-text)" } satisfies CSSProperties,
} as const;
