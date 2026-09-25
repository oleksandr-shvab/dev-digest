/* Skill VersionsTab — newest-first history with Current pill, Diff and Restore. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Card, ErrorState, Skeleton } from "@devdigest/ui";
import type { Skill, SkillVersion } from "@devdigest/shared";
import { useRestoreSkillVersion, useSkillVersions } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { RestoreConfirmModal } from "./_components/RestoreConfirmModal";
import { VersionDiffModal } from "./_components/VersionDiffModal";
import { formatDay } from "./helpers";
import { s } from "./styles";

export function VersionsTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const { data: versions, isLoading, isError, refetch } = useSkillVersions(skill.id);
  const restore = useRestoreSkillVersion();
  const [diffing, setDiffing] = React.useState<SkillVersion | null>(null);
  const [restoring, setRestoring] = React.useState<SkillVersion | null>(null);

  if (isLoading) return <Skeleton height={120} />;
  if (isError || !versions) return <ErrorState body={t("versions.loadError")} onRetry={() => refetch()} />;

  const current = versions.find((v) => v.current);

  const onRestore = (v: SkillVersion) =>
    restore.mutate(
      { id: skill.id, version: v.version },
      {
        onSuccess: (saved) => {
          setRestoring(null);
          toast.success(t("versions.restored", { from: v.version, version: saved.version }));
        },
      },
    );

  return (
    <div style={s.wrap}>
      {restoring && (
        <RestoreConfirmModal
          version={restoring.version}
          next={skill.version + 1}
          pending={restore.isPending}
          onConfirm={() => onRestore(restoring)}
          onClose={() => setRestoring(null)}
        />
      )}
      {diffing && current && <VersionDiffModal from={diffing} to={current} onClose={() => setDiffing(null)} />}
      <div style={s.head}>
        <h2 style={s.h2}>{t("versions.title")}</h2>
        <Badge>{versions.length}</Badge>
      </div>
      <p style={s.caption}>{t("versions.caption")}</p>
      <Card pad={false}>
        {versions.map((v) => (
          <div key={v.version} style={s.row}>
            <Badge mono>v{v.version}</Badge>
            <span style={s.message}>{v.message}</span>
            <span className="tnum" style={s.date}>
              {formatDay(v.created_at)}
            </span>
            {v.current ? (
              <Badge color="var(--ok)" bg="var(--ok-bg)">
                {t("versions.current")}
              </Badge>
            ) : (
              <div style={s.actions}>
                <Button kind="ghost" size="sm" onClick={() => setDiffing(v)} aria-label={t("versions.diffAria", { version: v.version })}>
                  {t("versions.diff")}
                </Button>
                <Button
                  kind="ghost"
                  size="sm"
                  icon="History"
                  onClick={() => setRestoring(v)}
                  aria-label={t("versions.restoreAria", { version: v.version })}
                >
                  {t("versions.restore")}
                </Button>
              </div>
            )}
          </div>
        ))}
      </Card>
    </div>
  );
}
