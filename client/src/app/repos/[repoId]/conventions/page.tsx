/* Conventions — /repos/:repoId/conventions. Scan the cloned repo for house
   conventions and turn the accepted ones into a skill (server spec:
   server/specs/conventions.md, client spec: client/specs/conventions.md). */
"use client";

import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { ConventionsView } from "./_components/ConventionsView";

export default function ConventionsPage() {
  const t = useTranslations("conventions");
  const params = useParams<{ repoId: string }>();
  const repoId = params.repoId;
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);
  const repoFullName = activeRepo?.full_name ?? t("page.repoFallback");

  const crumb = [{ label: t("page.crumbLab") }, { label: t("page.crumbConventions") }];

  if (repoNotFound) {
    return (
      <AppShell crumb={crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  return (
    <AppShell crumb={crumb}>
      <ConventionsView repoId={repoId} repoFullName={repoFullName} />
    </AppShell>
  );
}
