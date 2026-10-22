/* BlastRadiusCard — what else this PR's changes can reach: the symbols declared in the
   changed files, who calls them (file:line, linked to GitHub) and the HTTP endpoints and
   crons behind those callers. Read from the repo-intel index: no model call, no GitHub call. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon, SectionLabel, Skeleton } from "@devdigest/ui";
import { useBlastRadius } from "@/lib/hooks";
import { DEGRADED_BADGE_KEY, SUMMARY_STATS } from "./constants";
import { countBlast } from "./helpers";
import { s } from "./styles";
import { DownstreamGroup } from "./_components/DownstreamGroup";
import { ResyncButton } from "./_components/ResyncButton";

interface BlastRadiusCardProps {
  repoId: string;
  prId: string | null;
  repoFullName: string | null;
  headSha: string;
}

export function BlastRadiusCard({ repoId, prId, repoFullName, headSha }: BlastRadiusCardProps) {
  const t = useTranslations("blast");
  const { data, isLoading, isError } = useBlastRadius(prId);

  if (!prId) return null;
  if (isLoading) {
    return (
      <div role="status" aria-label={t("loading")}>
        <Skeleton height={140} />
      </div>
    );
  }
  if (isError || !data) return <div style={s.error}>{t("loadError")}</div>;

  const counts = countBlast(data);
  const badge = data.degraded ? (
    <div style={s.actions}>
      <Badge icon="AlertTriangle" color="var(--warn)" bg="var(--warn-bg)">
        {t(data.reason ? DEGRADED_BADGE_KEY[data.reason] : "badge.unknown")}
      </Badge>
      <ResyncButton repoId={repoId} prId={prId} />
    </div>
  ) : null;

  return (
    <section style={s.card}>
      <SectionLabel icon="Zap" right={badge}>
        {t("title")}
      </SectionLabel>
      <ul style={s.stats}>
        {SUMMARY_STATS.map((stat) => {
          const StatIcon = Icon[stat.icon];
          return (
            <li key={stat.key} aria-label={`${counts[stat.key]} ${t(stat.labelKey)}`} style={s.stat}>
              <StatIcon size={14} />
              <span style={s.statValue}>{counts[stat.key]}</span>
              <span>{t(stat.labelKey)}</span>
            </li>
          );
        })}
      </ul>
      {data.downstream.length === 0 ? (
        <p style={s.empty}>{t("noDownstream", { count: counts.symbols })}</p>
      ) : (
        <div style={s.groups}>
          {data.downstream.map((impact) => (
            <DownstreamGroup key={impact.symbol} impact={impact} repoFullName={repoFullName} headSha={headSha} />
          ))}
        </div>
      )}
    </section>
  );
}
