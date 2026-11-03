/* Project Context — /repos/:repoId/context. Read-only browser of the repo's
   Markdown docs (agents and skills attach them from their own editors). */
"use client";

import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { ContextView } from "./_components/ContextView";

export default function ProjectContextPage() {
  const t = useTranslations("context");
  const { repoId } = useParams<{ repoId: string }>();
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);

  const crumb = [{ label: t("page.crumbWorkspace") }, { label: t("page.crumbContext") }];

  if (repoNotFound) {
    return (
      <AppShell crumb={crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  return (
    <AppShell crumb={crumb}>
      <ContextView
        repoId={repoId}
        repoFullName={activeRepo?.full_name ?? null}
        branch={activeRepo?.default_branch ?? null}
      />
    </AppShell>
  );
}
