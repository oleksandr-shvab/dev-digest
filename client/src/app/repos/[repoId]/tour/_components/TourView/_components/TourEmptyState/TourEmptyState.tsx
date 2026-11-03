/* TourEmptyState — no tour stored yet: what the tour is, and the explicit Generate button. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Icon } from "@devdigest/ui";
import { s } from "./styles";

export function TourEmptyState({
  canGenerate,
  generating,
  onGenerate,
}: {
  canGenerate: boolean;
  generating: boolean;
  onGenerate: () => void;
}) {
  const t = useTranslations("tour");
  return (
    <div style={s.wrap}>
      <div style={s.icon}>
        <Icon.Layers size={22} />
      </div>
      <div style={s.title}>{t("empty.title")}</div>
      <p style={s.body}>{t("empty.description")}</p>
      <div style={s.cta}>
        <Button kind="primary" icon="Sparkles" onClick={onGenerate} disabled={!canGenerate || generating}>
          {t("header.generate")}
        </Button>
      </div>
    </div>
  );
}
