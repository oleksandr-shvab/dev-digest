/* SkillBodyEditor — plain mono textarea with a scroll-synced line-number
   gutter, an "unsaved" chip and an advisory token count. Tab inserts two spaces. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon } from "@devdigest/ui";
import { estimateTokens } from "@/lib/tokens";
import { TAB_INSERT } from "./constants";
import { insertAt, lineCount } from "./helpers";
import { s } from "./styles";

export function SkillBodyEditor({
  name,
  value,
  onChange,
  dirty,
  invalid,
}: {
  name: string;
  value: string;
  onChange: (v: string) => void;
  dirty: boolean;
  invalid?: boolean;
}) {
  const t = useTranslations("skills");
  const gutterRef = React.useRef<HTMLDivElement>(null);
  const areaRef = React.useRef<HTMLTextAreaElement>(null);
  const caret = React.useRef<number | null>(null);
  const lines = lineCount(value);

  // Restore the caret after a controlled Tab insertion re-renders the textarea.
  React.useLayoutEffect(() => {
    if (caret.current != null && areaRef.current) {
      areaRef.current.setSelectionRange(caret.current, caret.current);
      caret.current = null;
    }
  }, [value]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Tab" || e.shiftKey) return;
    e.preventDefault();
    const { selectionStart, selectionEnd } = e.currentTarget;
    const next = insertAt(value, selectionStart, selectionEnd, TAB_INSERT);
    caret.current = next.caret;
    onChange(next.text);
  };

  return (
    <div style={s.wrap(!!invalid)}>
      <div style={s.bar}>
        <Icon.FileText size={14} />
        <span className="mono" style={s.fileName}>
          {name || t("editor.untitled")}.md
        </span>
        {dirty && <Badge color="var(--warn)" bg="var(--warn-bg)">{t("editor.unsaved")}</Badge>}
        <span className="mono tnum" style={s.tokens}>
          {t("editor.tokens", { count: estimateTokens(value) })}
        </span>
      </div>
      <div style={s.body}>
        <div ref={gutterRef} aria-hidden="true" className="mono" style={s.gutter}>
          {Array.from({ length: lines }, (_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>
        <textarea
          ref={areaRef}
          className="mono"
          aria-label={t("editor.bodyLabel")}
          value={value}
          wrap="off"
          spellCheck={false}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          onScroll={(e) => {
            if (gutterRef.current) gutterRef.current.scrollTop = e.currentTarget.scrollTop;
          }}
          style={s.textarea}
        />
      </div>
    </div>
  );
}
