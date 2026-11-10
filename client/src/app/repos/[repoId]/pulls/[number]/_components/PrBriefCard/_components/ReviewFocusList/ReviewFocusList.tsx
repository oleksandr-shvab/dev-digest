/* ReviewFocusList — the files and lines to read first, in reading order. Each
   item is one button that opens that file (and line) in Files changed. Item text
   is model output: rendered as plain text children only. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import type { ReviewFocusItem } from "@devdigest/shared";
import { MAX_FOCUS } from "../../constants";
import { s } from "./styles";

export function ReviewFocusList({
  items,
  onOpenFile,
}: {
  items: ReviewFocusItem[];
  onOpenFile: (path: string, line: number | null) => void;
}) {
  const t = useTranslations("brief");
  const shown = items.slice(0, MAX_FOCUS);
  if (shown.length === 0) return null;
  return (
    <section style={s.section}>
      <div style={s.head}>
        <h3 style={s.heading}>{t("prBrief.reviewFocus")}</h3>
        <Badge color="var(--text-secondary)">{shown.length}</Badge>
      </div>
      <ol style={s.list} aria-label={t("prBrief.reviewFocus")}>
        {shown.map((item, i) => {
          const target = item.line === null ? item.file : `${item.file}:${item.line}`;
          return (
            <li key={`${i}-${target}`}>
              <button
                type="button"
                style={s.item}
                aria-label={
                  item.line === null
                    ? t("prBrief.openFile", { file: item.file })
                    : t("prBrief.openFileLine", { file: item.file, line: item.line })
                }
                onClick={() => onOpenFile(item.file, item.line)}
              >
                <span className="mono" style={s.target}>
                  {target}
                </span>
                {` — ${item.reason}`}
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
