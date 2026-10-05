import type { CSSProperties } from "react";
import { LIST_PANE_WIDTH } from "./constants";

/** Co-located styles for SkillsListView. */
export const s = {
  layout: { display: "flex", height: "calc(100vh - 52px)" } satisfies CSSProperties,
  listPane: {
    width: LIST_PANE_WIDTH,
    flexShrink: 0,
    borderRight: "1px solid var(--border)",
    display: "flex",
    flexDirection: "column",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  listHead: { padding: "16px 16px 12px" } satisfies CSSProperties,
  titleRow: { display: "flex", alignItems: "center", gap: 10, marginBottom: 14 } satisfies CSSProperties,
  h1: { fontSize: 18, fontWeight: 700, flex: 1 } satisfies CSSProperties,
  search: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 12px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  searchIcon: { color: "var(--text-muted)" } satisfies CSSProperties,
  searchInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    background: "transparent",
    border: "none",
    outline: "none",
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  listBody: { flex: 1, overflow: "auto", padding: "0 12px 12px" } satisfies CSSProperties,
  detailPane: { flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column" } satisfies CSSProperties,
  emptyActions: { display: "flex", justifyContent: "center", marginTop: -28 } satisfies CSSProperties,
  skeletons: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
} as const;
