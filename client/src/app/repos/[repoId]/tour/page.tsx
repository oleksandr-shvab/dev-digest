/* Onboarding Tour — /repos/:repoId/tour. A stored, five-part tour of the repo,
   generated only by an explicit click (spec: specs/02-onboarding-tour.md). */
"use client";

import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { TourView } from "./_components/TourView";

export default function OnboardingTourPage() {
  const t = useTranslations("tour");
  const { repoId } = useParams<{ repoId: string }>();
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);

  const crumb = [{ label: activeRepo?.full_name ?? t("page.repoFallback") }, { label: t("page.crumbTour") }];

  if (repoNotFound) {
    return (
      <AppShell crumb={crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  return (
    <AppShell crumb={crumb}>
      <TourView
        repoId={repoId}
        repoFullName={activeRepo?.full_name ?? ""}
        repoName={activeRepo?.name ?? t("page.repoFallback")}
      />
    </AppShell>
  );
}
