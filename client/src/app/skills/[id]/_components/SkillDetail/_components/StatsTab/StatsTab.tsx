/* Skill StatsTab — 30-day correlation stats from GET /skills/:id/stats. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge, Card, CircularScore, Donut, ErrorState, MetricCard, Skeleton } from "@devdigest/ui";
import { useSkillStats } from "@/lib/hooks/skills";
import { formatRate } from "@/lib/skill-meta";
import { toSegments } from "./helpers";
import { s } from "./styles";

export function StatsTab({ skillId }: { skillId: string }) {
  const t = useTranslations("skills");
  const { data: stats, isLoading, isError, refetch } = useSkillStats(skillId);

  if (isLoading) return <Skeleton height={120} />;
  if (isError || !stats) return <ErrorState body={t("stats.loadError")} onRetry={() => refetch()} />;

  const pullHint = stats.pull_rate == null ? t("stats.noRuns") : null;
  const acceptHint = stats.accept_rate == null ? t("stats.noTriaged") : null;

  return (
    <div style={s.wrap}>
      <p style={s.caption}>{t("stats.caption")}</p>

      <div style={s.metrics}>
        <div style={s.metricCol}>
          <MetricCard label={t("stats.usedBy")} value={stats.used_by} suffix={t("stats.agentsSuffix", { count: stats.used_by })} />
        </div>
        <div style={s.metricCol}>
          <MetricCard label={t("stats.pull")} value={formatRate(stats.pull_rate)} />
          {pullHint && <span style={s.hint}>{pullHint}</span>}
        </div>
        <div style={s.metricCol}>
          <MetricCard
            label={t("stats.accept")}
            value={
              <span style={s.ringValue}>
                {formatRate(stats.accept_rate)}
                {stats.accept_rate != null && (
                  <CircularScore score={Math.round(stats.accept_rate * 100)} size={30} stroke={3} />
                )}
              </span>
            }
          />
          {acceptHint && <span style={s.hint}>{acceptHint}</span>}
        </div>
        <div style={s.metricCol}>
          <MetricCard label={t("stats.findings")} value={stats.findings} />
        </div>
      </div>

      <div style={s.section}>
        <h3 style={s.h3}>{t("stats.agentsUsing")}</h3>
        {stats.agents.length === 0 ? (
          <span style={s.muted}>{t("stats.noAgents")}</span>
        ) : (
          <Card pad={false}>
            {stats.agents.map((a) => (
              <div key={a.id} style={s.agentRow}>
                <span style={s.agentName}>{a.name}</span>
                {!a.enabled && <Badge color="var(--text-muted)">{t("stats.disabled")}</Badge>}
                <Link href={`/agents/${a.id}?tab=skills`} style={s.open} aria-label={`${t("stats.open")} ${a.name}`}>
                  {t("stats.open")}
                </Link>
              </div>
            ))}
          </Card>
        )}
      </div>

      <div style={s.section}>
        <h3 style={s.h3}>{t("stats.byCategory")}</h3>
        {stats.by_category.length === 0 ? (
          <span style={s.muted}>{t("stats.noFindings")}</span>
        ) : (
          <Donut segments={toSegments(stats.by_category)} formatValue={(v) => String(v)} />
        )}
      </div>

      <p style={s.footnote}>{t("stats.footnote")}</p>
    </div>
  );
}
