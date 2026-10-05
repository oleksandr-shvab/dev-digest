"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Card, Markdown } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { s } from "./styles";

/** Renders the SAVED body the way the reviewing agent receives it. */
export function PreviewTab({ skill, hasUnsavedEdits }: { skill: Skill; hasUnsavedEdits: boolean }) {
  const t = useTranslations("skills");
  return (
    <div style={s.wrap}>
      <h2 style={s.h2}>{t("preview.title")}</h2>
      <p style={s.caption}>{t("preview.caption")}</p>
      {hasUnsavedEdits && (
        <div role="note" style={s.note}>
          {t("preview.unsavedNote")}
        </div>
      )}
      <Card style={s.card}>{skill.body ? <Markdown>{skill.body}</Markdown> : t("preview.empty")}</Card>
    </div>
  );
}
