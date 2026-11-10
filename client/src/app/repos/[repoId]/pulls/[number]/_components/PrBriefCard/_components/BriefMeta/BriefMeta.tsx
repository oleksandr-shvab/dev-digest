/* BriefMeta — the brief's meta line: tokens, cost (or "cost unknown"), and the
   commit it was generated for with its age. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { PrBriefState } from "@devdigest/shared";
import { formatUsd } from "@/lib/cost";
import { relativeAge } from "@/lib/relative-age";
import { shortSha } from "../../helpers";
import { s } from "../../styles";

export function BriefMeta({
  state,
  now = Date.now(),
}: {
  state: PrBriefState;
  /** Epoch ms the age is measured against; injectable for tests. */
  now?: number;
}) {
  const t = useTranslations("brief");
  const age = state.generated_at ? relativeAge(state.generated_at, now) : null;
  return (
    <div style={s.meta}>
      {state.tokens_in !== null && state.tokens_out !== null && (
        <span>
          {t("prBrief.meta.tokens", {
            tokensIn: state.tokens_in.toLocaleString("en-US"),
            tokensOut: state.tokens_out.toLocaleString("en-US"),
          })}
        </span>
      )}
      <span>·</span>
      <span>{state.cost_usd === null ? t("prBrief.meta.costUnknown") : formatUsd(state.cost_usd)}</span>
      {state.head_sha && age && (
        <>
          <span>·</span>
          <span>
            {t("prBrief.meta.commit", {
              sha: shortSha(state.head_sha),
              age: t(`prBrief.age.${age.unit}`, { n: age.n }),
            })}
          </span>
        </>
      )}
    </div>
  );
}
