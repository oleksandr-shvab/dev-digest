/* TourHeader — title, "generated from" line, the Regenerate / Share actions and
   every notice the tour state can carry (stale, partial index, index missing,
   generating, last failure). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import type { OnboardingIndexReadiness, OnboardingTour } from "@devdigest/shared";
import { isPartialIndex, isStale, relativeAge } from "./helpers";
import { s } from "./styles";

export function TourHeader({
  repoName,
  tour,
  index,
  generating,
  lastError,
  onGenerate,
  onShare,
  now = Date.now(),
}: {
  repoName: string;
  tour: OnboardingTour | null;
  index: OnboardingIndexReadiness;
  generating: boolean;
  lastError: string | null;
  onGenerate: () => void;
  onShare: () => void;
  /** Epoch ms the age is measured against; injectable for tests. */
  now?: number;
}) {
  const t = useTranslations("tour");
  const blocked = generating || !index.ready;
  const age = tour ? relativeAge(tour.generated_at, now) : null;
  const showStale = isStale(tour, index);
  const showPartial = isPartialIndex(tour);

  return (
    <div style={s.wrap}>
      <div style={s.top}>
        <div>
          <h1 style={s.title}>
            {t.rich("header.title", { name: repoName, accent: (chunks) => <span style={s.accent}>{chunks}</span> })}
          </h1>
          {tour && age && (
            <p style={s.subtitle}>
              {t("header.subtitle", {
                count: tour.index_file_count.toLocaleString("en-US"),
                age: t(`age.${age.unit}`, { n: age.n }),
              })}
            </p>
          )}
        </div>
        <div style={s.actions}>
          {tour && (
            <Button kind="secondary" icon="RefreshCw" onClick={onGenerate} disabled={blocked}>
              {t("header.regenerate")}
            </Button>
          )}
          <Button kind="secondary" icon="Link" onClick={onShare}>
            {t("header.share")}
          </Button>
        </div>
      </div>

      {(showStale || showPartial || !index.ready || generating) && (
        <div style={s.notices}>
          {showStale && <span style={s.notice}>{t("header.stale")}</span>}
          {showPartial && <span style={s.notice}>{t("header.partialIndex")}</span>}
          {!index.ready && <span style={s.notice}>{t("header.indexFirst")}</span>}
          {generating && <span style={s.notice}>{t("header.generating")}</span>}
        </div>
      )}

      {lastError && !generating && (
        <div role="alert" style={s.error}>
          <span>{t("header.failed", { reason: lastError })}</span>
          <Button kind="secondary" size="sm" onClick={onGenerate} disabled={!index.ready}>
            {t("header.tryAgain")}
          </Button>
        </div>
      )}
    </div>
  );
}
