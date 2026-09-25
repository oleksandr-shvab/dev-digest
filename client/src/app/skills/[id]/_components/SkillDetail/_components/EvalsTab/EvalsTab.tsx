"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { EmptyState } from "@devdigest/ui";

/** Stub — skill evals arrive in a later lesson (no requests are made). */
export function EvalsTab() {
  const t = useTranslations("skills");
  return <EmptyState icon="FlaskConical" title={t("evals.emptyTitle")} body={t("evals.emptyBody")} />;
}
