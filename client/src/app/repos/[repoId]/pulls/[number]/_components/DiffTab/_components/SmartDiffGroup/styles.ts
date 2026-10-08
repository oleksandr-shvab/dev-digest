import type { CSSProperties } from "react";
import { SEV } from "@devdigest/ui";

/** Co-located styles for SmartDiffGroup. */
export const s = {
  group: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 4px",
    cursor: "pointer",
  } satisfies CSSProperties,
  label: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  withFindings: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  dot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: SEV.CRITICAL.c,
    flexShrink: 0,
  } satisfies CSSProperties,
  count: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;

/** Chevron rotates 90deg when the group is open. */
export function chevronFor(open: boolean): CSSProperties {
  return {
    color: "var(--text-muted)",
    transform: open ? "rotate(90deg)" : "none",
    transition: "transform .12s",
  };
}
