/* FindingsOutsideDiff — footer list for review findings whose line is not in
   this file's patch (or the file has no patch text), so none is dropped. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import { FindingCard } from "@/components/finding-card";
import { cs } from "../comments";
import type { DiffFindingApi } from "../findings";

export function FindingsOutsideDiff({
  findings,
  findingApi,
}: {
  findings: FindingRecord[];
  findingApi: DiffFindingApi;
}) {
  const t = useTranslations("prReview");
  if (findings.length === 0) return null;
  return (
    <div style={cs.outdatedWrap}>
      <span style={cs.outdatedTitle}>{t("smartDiff.outsideDiffTitle", { count: findings.length })}</span>
      {findings.map((f) => (
        <FindingCard
          key={f.id}
          f={f}
          defaultExpanded
          pending={findingApi.pending}
          onAction={(a) => findingApi.onAction(f.id, a)}
        />
      ))}
    </div>
  );
}
