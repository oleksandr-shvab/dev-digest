/* PrBriefCard — the PR Brief block on the Overview tab: verdict banner from the
   newest review, the summary, Risk areas, Review focus and a meta line, from one
   stored model call the user asks for explicitly. States: loading, error, no
   changed files, no brief yet, ready (and a busy skeleton while generating).
   Every model string is rendered as plain text children — no HTML, no Markdown. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, EmptyState, SectionLabel, Skeleton } from "@devdigest/ui";
import type { PrBriefState } from "@devdigest/shared";
import { useGeneratePrBrief, usePrBrief } from "@/lib/hooks/brief";
import { usePrReviews } from "@/lib/hooks/reviews";
import { VerdictBanner } from "../VerdictBanner";
import { bannerCounts, isInDiff, liveMessage, newestVerdictReview, viewOf } from "./helpers";
import { s } from "./styles";
import { RiskList } from "./_components/RiskList";
import { ReviewFocusList } from "./_components/ReviewFocusList";
import { BriefMeta } from "./_components/BriefMeta";

/** "Generated without" and "Left out to fit the input budget": what the brief did not see. */
function InputNotes({ state }: { state: PrBriefState }) {
  const t = useTranslations("brief");
  const unavailable = state.unavailable_inputs.map((u) =>
    u.ref ? `${t(`prBrief.input.${u.kind}`)} ${u.ref}` : t(`prBrief.input.${u.kind}`),
  );
  const omitted = state.omitted_inputs.map((o) =>
    t(`prBrief.omitted.${o.kind}`, { ref: o.ref ?? "", kept: o.kept ?? 0, total: o.total ?? 0 }),
  );
  return (
    <>
      {unavailable.length > 0 && (
        <div style={s.note}>
          <span style={s.noteTitle}>{t("prBrief.unavailableTitle")}</span>
          {unavailable.join(" · ")}
        </div>
      )}
      {omitted.length > 0 && (
        <div style={s.note}>
          <span style={s.noteTitle}>{t("prBrief.omittedTitle")}</span>
          {omitted.join(" · ")}
        </div>
      )}
    </>
  );
}

export function PrBriefCard({
  prId,
  diffPaths,
  onOpenFile,
}: {
  prId: string | null;
  /** Paths of this PR's changed files: a cited file outside them cannot be opened. */
  diffPaths: string[];
  onOpenFile: (path: string, line: number | null) => void;
}) {
  const t = useTranslations("brief");
  const { data: state, isLoading, isError } = usePrBrief(prId);
  const generate = useGeneratePrBrief(prId);
  const { data: reviews } = usePrReviews(prId);
  const [notInDiff, setNotInDiff] = React.useState<string | null>(null);

  if (!prId) return null;

  const busy = !!state?.generating || generate.isPending;
  const view = viewOf({ state, isLoading, isError, hasFiles: diffPaths.length > 0 });
  const verdictReview = newestVerdictReview(reviews ?? []);
  const live = liveMessage(state);
  const brief = state?.brief ?? null;

  const openFile = (path: string, line: number | null) => {
    if (isInDiff(diffPaths, path)) {
      setNotInDiff(null);
      onOpenFile(path, line);
    } else {
      setNotInDiff(path);
    }
  };

  const failure =
    state?.last_error && !busy ? (
      <div role="alert" style={s.alert}>
        <span>{t("prBrief.failed", { reason: state.last_error })}</span>
        <Button kind="secondary" size="sm" onClick={() => generate.mutate()}>
          {t("prBrief.retry")}
        </Button>
      </div>
    ) : null;

  return (
    <section style={s.card}>
      <SectionLabel
        icon="Sparkles"
        right={
          brief ? (
            <Button
              kind="ghost"
              size="sm"
              icon="RefreshCw"
              aria-label={t("prBrief.regenerate")}
              aria-busy={busy}
              loading={busy}
              onClick={() => generate.mutate()}
            />
          ) : undefined
        }
      >
        {t("prBrief.title")}
      </SectionLabel>
      <div role="status" aria-live="polite" aria-label={t("prBrief.statusLabel")} style={s.srOnly}>
        {live ? t(`prBrief.${live.key}`, live.values) : null}
      </div>

      {view === "loading" && <Skeleton height={160} />}
      {view === "error" && <div style={s.error}>{t("prBrief.loadError")}</div>}
      {view === "noFiles" && <p style={s.muted}>{t("prBrief.noFiles")}</p>}
      {view === "empty" && (
        <>
          <EmptyState
            icon="Sparkles"
            title={t("prBrief.emptyTitle")}
            body={t("prBrief.emptyBody")}
            cta={t("prBrief.generate")}
            onCta={() => generate.mutate()}
            ctaLoading={busy}
          />
          {busy && <Skeleton height={160} />}
          {failure}
        </>
      )}
      {view === "ready" && state && brief && (
        <>
          {verdictReview?.verdict && (
            <VerdictBanner
              verdict={verdictReview.verdict}
              summary={null}
              score={verdictReview.score}
              findingsCount={bannerCounts(verdictReview).findings}
              blockers={bannerCounts(verdictReview).blockers}
            />
          )}
          {failure}
          {busy ? (
            <Skeleton height={160} />
          ) : (
            <>
              {state.stale && (
                <div style={s.stale}>{t("prBrief.stale")}</div>
              )}
              <p style={s.summary}>{brief.summary}</p>
              <InputNotes state={state} />
              <RiskList risks={brief.risks} onOpenFile={openFile} />
              <ReviewFocusList items={brief.review_focus} onOpenFile={openFile} />
              {notInDiff && <div style={s.notInDiff}>{t("prBrief.notInDiff")}</div>}
              <BriefMeta state={state} />
            </>
          )}
        </>
      )}
    </section>
  );
}
