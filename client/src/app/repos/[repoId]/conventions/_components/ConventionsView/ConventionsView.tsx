/* ConventionsView — scan the active repo, triage candidates (Accept / Reject /
   Edit inline), then turn the accepted ones into a skill. Repo-scoped page:
   /repos/:repoId/conventions (server spec: server/specs/conventions.md). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Chip, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useRouter } from "next/navigation";
import { ApiError } from "@/lib/api";
import {
  useConventions,
  useExtractConventions,
  useUpdateConvention,
} from "@/lib/hooks/conventions";
import { useToast } from "@/lib/toast";
import { ConventionCard } from "./_components/ConventionCard";
import { CreateConventionSkillModal } from "./_components/CreateConventionSkillModal";
import { filterCandidates, type ConventionFilter } from "./helpers";
import { s } from "./styles";

export function ConventionsView({ repoId, repoFullName }: { repoId: string; repoFullName: string }) {
  const t = useTranslations("conventions");
  const toast = useToast();
  const router = useRouter();
  const { data: candidates, isLoading, isError, refetch } = useConventions(repoId);
  const extract = useExtractConventions(repoId);
  const update = useUpdateConvention(repoId);
  const [filter, setFilter] = React.useState<ConventionFilter>("all");
  const [showCreate, setShowCreate] = React.useState(false);
  const [scanError, setScanError] = React.useState<string | null>(null);

  const list = candidates ?? [];
  const pendingCount = list.filter((c) => c.status === "pending").length;
  const acceptedCount = list.filter((c) => c.status === "accepted").length;
  const acceptedIds = list.filter((c) => c.status === "accepted").map((c) => c.id);
  const filtered = filterCandidates(list, filter);

  const runScan = () => {
    setScanError(null);
    extract.mutate(undefined, {
      onSuccess: (result) => {
        toast.success(t("page.scanResult", { kept: result.candidates.length, dropped: result.dropped.length }));
      },
      onError: (e) => {
        setScanError(e instanceof ApiError ? e.message : t("page.extractionFailed"));
      },
    });
  };

  const onSaved = (skill: Skill) => {
    setShowCreate(false);
    toast.success(t("createSkill.saved", { name: skill.name }));
    router.push(`/skills/${skill.id}`);
  };

  return (
    <>
      <div style={s.pageHeader}>
        <div>
          <h1 style={s.pageTitle}>{t("page.headingPrefix") + repoFullName}</h1>
          <p style={s.pageSubtitle}>{t("page.subtitle")}</p>
          {list.length > 0 && <p style={s.count}>{t("page.candidateCount", { count: list.length })}</p>}
        </div>
        {list.length > 0 && (
          <div style={s.headerActions}>
            <Button kind="secondary" icon="RefreshCw" onClick={runScan} disabled={extract.isPending}>
              {extract.isPending ? t("page.scanning") : t("page.rescan")}
            </Button>
            {acceptedCount > 0 && (
              <Button kind="primary" icon="Sparkles" onClick={() => setShowCreate(true)}>
                {t("page.createSkill", { count: acceptedCount })}
              </Button>
            )}
          </div>
        )}
      </div>

      {scanError && <div style={s.error}>{scanError}</div>}

      {isLoading ? (
        <>
          <Skeleton height={90} style={{ marginBottom: 10 }} />
          <Skeleton height={90} style={{ marginBottom: 10 }} />
          <Skeleton height={90} />
        </>
      ) : isError ? (
        <ErrorState body={t("page.loadError")} onRetry={() => refetch()} />
      ) : list.length === 0 ? (
        <EmptyState
          icon="ListChecks"
          title={t("page.empty.title")}
          body={t("page.empty.body")}
          cta={extract.isPending ? t("page.scanning") : t("page.empty.cta")}
          onCta={runScan}
          ctaLoading={extract.isPending}
        />
      ) : (
        <>
          <div style={s.filters}>
            <Chip active={filter === "all"} onClick={() => setFilter("all")}>
              {t("page.filters.all", { count: list.length })}
            </Chip>
            <Chip active={filter === "pending"} onClick={() => setFilter("pending")}>
              {t("page.filters.pending", { count: pendingCount })}
            </Chip>
            <Chip active={filter === "accepted"} onClick={() => setFilter("accepted")}>
              {t("page.filters.accepted", { count: acceptedCount })}
            </Chip>
          </div>
          {filtered.map((candidate) => (
            <ConventionCard
              key={candidate.id}
              candidate={candidate}
              onPatch={(patch) => update.mutate({ id: candidate.id, patch })}
            />
          ))}
        </>
      )}

      {showCreate && (
        <CreateConventionSkillModal
          repoId={repoId}
          candidateIds={acceptedIds}
          onClose={() => setShowCreate(false)}
          onSaved={onSaved}
        />
      )}
    </>
  );
}
