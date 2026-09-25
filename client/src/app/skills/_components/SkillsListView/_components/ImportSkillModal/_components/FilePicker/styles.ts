import type { CSSProperties } from "react";

/** Co-located styles for FilePicker. */
export const s = {
  zone: (over: boolean): CSSProperties => ({
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: "48px 24px",
    borderRadius: 10,
    border: "1.5px dashed " + (over ? "var(--accent)" : "var(--border-strong)"),
    background: over ? "var(--accent-bg)" : "var(--bg-surface)",
    cursor: "pointer",
    textAlign: "center",
  }),
  icon: { color: "var(--text-muted)" } satisfies CSSProperties,
  title: { fontSize: 14, fontWeight: 600 } satisfies CSSProperties,
  hint: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  // Visually hidden but still focusable/labelled — the <label> is the click target.
  input: {
    position: "absolute",
    width: 1,
    height: 1,
    margin: -1,
    overflow: "hidden",
    clip: "rect(0 0 0 0)",
    opacity: 0,
  } satisfies CSSProperties,
} as const;
