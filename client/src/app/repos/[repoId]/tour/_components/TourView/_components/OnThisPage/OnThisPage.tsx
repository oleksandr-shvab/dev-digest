/* OnThisPage — in-page navigation over the five sections. The current section
   is marked with aria-current and a visible bullet, so it is not colour-only. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { s } from "./styles";

export function OnThisPage({
  sections,
  currentId,
  onSelect,
}: {
  sections: { id: string; title: string }[];
  currentId: string;
  onSelect: (id: string) => void;
}) {
  const t = useTranslations("tour");
  return (
    <nav aria-label={t("nav.label")} style={s.nav}>
      <p style={s.label}>{t("nav.label")}</p>
      <ul style={s.list}>
        {sections.map((section) => {
          const current = section.id === currentId;
          return (
            <li key={section.id}>
              <button
                type="button"
                aria-current={current ? "location" : undefined}
                style={current ? { ...s.item, ...s.itemCurrent } : s.item}
                onClick={() => onSelect(section.id)}
              >
                <span aria-hidden="true" style={s.marker}>
                  {current ? "•" : ""}
                </span>
                {section.title}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
