/** Stable DndContext id prefix (keeps generated aria ids identical on server and client). */
export const DND_ID_PREFIX = "context-doc-picker-dnd";

/** Type badge colours — the badge always carries its text too, never colour alone. */
export const DOC_TYPE_STYLE = {
  specs: { color: "var(--accent-text)", bg: "var(--accent-bg)" },
  docs: { color: "var(--ok)", bg: "var(--ok-bg)" },
  insights: { color: "var(--warn)", bg: "var(--warn-bg)" },
} as const;
