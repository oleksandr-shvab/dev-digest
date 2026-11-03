/* TourSection — one collapsible card of the tour. The card element carries the
   section `id` (scroll target); the h2 is focusable so "On this page" can move focus. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, type IconName } from "@devdigest/ui";
import { s } from "./styles";

export function TourSection({
  id,
  icon,
  title,
  children,
}: {
  id: string;
  icon: IconName;
  title: string;
  children: React.ReactNode;
}) {
  const t = useTranslations("tour");
  const [open, setOpen] = React.useState(true);
  const SectionIcon = Icon[icon];
  const Chevron = open ? Icon.ChevronDown : Icon.ChevronRight;

  return (
    <section id={id} style={s.card}>
      <div style={s.header}>
        <h2 id={`${id}-heading`} tabIndex={-1} style={s.heading}>
          <SectionIcon size={16} />
          {title}
        </h2>
        <button
          type="button"
          style={s.toggle}
          aria-expanded={open}
          aria-controls={`${id}-body`}
          aria-label={t("sections.toggle", { title })}
          onClick={() => setOpen((o) => !o)}
        >
          <Chevron size={16} />
        </button>
      </div>
      <div id={`${id}-body`} hidden={!open} style={s.body}>
        {children}
      </div>
    </section>
  );
}
