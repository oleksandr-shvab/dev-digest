/* TourView — the Onboarding Tour page body: a stored five-part tour with a
   generate / regenerate action, or an empty state. Repo-scoped page:
   /repos/:repoId/tour. Reading is a plain GET; generation is an explicit click. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { ErrorState, Skeleton } from "@devdigest/ui";
import { ApiError } from "@/lib/api";
import { useGenerateOnboardingTour, useOnboardingTour } from "@/lib/hooks/onboarding";
import { useToast } from "@/lib/toast";
import { ArchitectureSection } from "./_components/ArchitectureSection";
import { CopyFallback } from "./_components/CopyFallback";
import { CriticalPathsSection } from "./_components/CriticalPathsSection";
import { FirstTasksSection } from "./_components/FirstTasksSection";
import { OnThisPage } from "./_components/OnThisPage";
import { ReadingPathSection } from "./_components/ReadingPathSection";
import { RunLocallySection } from "./_components/RunLocallySection";
import { TourEmptyState } from "./_components/TourEmptyState";
import { TourHeader } from "./_components/TourHeader";
import { TourSection } from "./_components/TourSection";
import { TOUR_SECTIONS, TOUR_SECTION_IDS, type TourSectionId } from "./constants";
import { canGenerate, goToSection, viewOf } from "./helpers";
import { useActiveSection } from "./hooks/useActiveSection";
import { useClipboardCopy } from "./hooks/useClipboardCopy";
import { s } from "./styles";

export function TourView({
  repoId,
  repoFullName,
  repoName,
}: {
  repoId: string;
  repoFullName: string;
  repoName: string;
}) {
  const t = useTranslations("tour");
  const toast = useToast();
  const query = useOnboardingTour(repoId);
  const generate = useGenerateOnboardingTour(repoId);
  const { copy, announcement, fallbackText, clearFallback } = useClipboardCopy();
  const state = query.data;
  const view = repoFullName ? viewOf(query) : "loading";
  const currentId = useActiveSection(TOUR_SECTION_IDS, view === "ready");

  const onGenerate = () =>
    generate.mutate(undefined, {
      onError: (e) => toast.error(e instanceof ApiError ? e.message : t("page.generateError")),
    });
  const onShare = () => copy(`${window.location.origin}${window.location.pathname}`, t("copy.linkCopied"));
  const onCopyCommand = (text: string) => copy(text, t("copy.copied"));

  if (view === "loading") {
    return (
      <>
        <Skeleton height={60} style={{ marginBottom: 16 }} />
        <Skeleton height={160} style={{ marginBottom: 12 }} />
        <Skeleton height={160} />
      </>
    );
  }
  if (view === "error" || !state) {
    return <ErrorState body={t("page.loadError")} onRetry={() => query.refetch()} />;
  }

  const headerProps = {
    repoName,
    index: state.index,
    generating: state.generating,
    lastError: state.last_error,
    onGenerate,
    onShare,
  };

  const status = (
    <div role="status" aria-live="polite" aria-label={t("page.statusLabel")} style={s.announce}>
      {announcement}
      {state.generating && <span style={s.srOnly}>{t("header.generating")}</span>}
    </div>
  );
  const fallback = fallbackText !== null && <CopyFallback text={fallbackText} onDismiss={clearFallback} />;

  const tour = state.tour;
  if (view === "empty" || !tour) {
    return (
      <>
        <TourHeader {...headerProps} tour={null} />
        {status}
        {fallback}
        <TourEmptyState canGenerate={canGenerate(state)} generating={state.generating} onGenerate={onGenerate} />
      </>
    );
  }

  const bodies: Record<TourSectionId, React.ReactNode> = {
    architecture: <ArchitectureSection architecture={tour.architecture} />,
    "critical-paths": (
      <CriticalPathsSection criticalPaths={tour.critical_paths} repoFullName={repoFullName} commitSha={tour.commit_sha} />
    ),
    "run-locally": <RunLocallySection steps={tour.run_steps} onCopy={onCopyCommand} />,
    "reading-path": <ReadingPathSection items={tour.reading_path} />,
    "first-tasks": <FirstTasksSection tasks={tour.first_tasks} />,
  };

  return (
    <>
      <TourHeader {...headerProps} tour={tour} />
      {status}
      {fallback}
      <div style={s.layout}>
        <OnThisPage
          sections={TOUR_SECTIONS.map((x) => ({ id: x.id, title: t(x.titleKey) }))}
          currentId={currentId}
          onSelect={goToSection}
        />
        <div>
          {TOUR_SECTIONS.map((x) => (
            <TourSection key={x.id} id={x.id} icon={x.icon} title={t(x.titleKey)}>
              {bodies[x.id]}
            </TourSection>
          ))}
        </div>
      </div>
    </>
  );
}
