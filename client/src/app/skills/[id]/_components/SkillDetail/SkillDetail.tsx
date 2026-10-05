/* SkillDetail — right pane of /skills: header (type icon, name, chips, run-on-evals,
   ⋯ menu) and the Config · Preview · Evals · Stats · Versions tabs. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge, Button, Dropdown, EmptyState, ErrorState, Icon, IconBtn, Skeleton, Tabs } from "@devdigest/ui";
import { ApiError } from "@/lib/api";
import { useDeleteSkill, useSkill, useSkillVersions } from "@/lib/hooks/skills";
import { SKILL_TYPE_STYLE } from "@/lib/skill-meta";
import { useToast } from "@/lib/toast";
import { ConfigTab } from "./_components/ConfigTab";
import { EvalsTab } from "./_components/EvalsTab";
import { PreviewTab } from "./_components/PreviewTab";
import { StatsTab } from "./_components/StatsTab";
import { VersionsTab } from "./_components/VersionsTab";
import { TABS } from "./constants";
import { importedFileName } from "./helpers";
import { s } from "./styles";

export function SkillDetail({
  id,
  tab,
  onTab,
  onDirtyChange,
}: {
  /** Skill id, or `"new"` for the empty create form. */
  id: string;
  tab: string;
  onTab: (tab: string) => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const t = useTranslations("skills");
  const router = useRouter();
  const toast = useToast();
  const isNew = id === "new";
  const { data: skill, isLoading, isError, error, refetch } = useSkill(isNew ? null : id);
  const del = useDeleteSkill();
  // Only imported skills need their version list up here (for the "Imported from <file>" notice).
  const { data: versions } = useSkillVersions(skill?.source === "imported_file" ? id : null);
  const [dirty, setDirty] = React.useState(false);

  const handleDirty = React.useCallback(
    (d: boolean) => {
      setDirty(d);
      onDirtyChange?.(d);
    },
    [onDirtyChange],
  );

  if (isNew) {
    return (
      <div style={s.wrap}>
        <div style={s.header}>
          <Icon.Sparkles size={18} style={{ color: "var(--accent)" }} />
          <h1 style={s.h1}>{t("detail.newTitle")}</h1>
        </div>
        <div style={s.body}>
          <ConfigTab onDirtyChange={handleDirty} />
        </div>
      </div>
    );
  }

  if (isError && error instanceof ApiError && error.status === 404) {
    return <EmptyState icon="Sparkles" title={t("detail.notFound.title")} body={t("detail.notFound.body")} />;
  }
  if (isError) return <ErrorState body={t("detail.loadError")} onRetry={() => refetch()} />;
  if (isLoading || !skill) {
    return (
      <div style={s.loading}>
        <Skeleton height={24} width={240} />
        <Skeleton height={200} />
      </div>
    );
  }

  const style = SKILL_TYPE_STYLE[skill.type];
  const TypeIcon = Icon[style.icon];
  const tabs = TABS.map((tb) => ({ key: tb.key, label: t(`tabs.${tb.labelKey}`), icon: tb.icon }));

  const onDelete = () => {
    if (!window.confirm(t("detail.deleteConfirm", { count: skill.stats?.used_by ?? 0 }))) return;
    del.mutate(skill.id, {
      onSuccess: () => {
        handleDirty(false);
        toast.success(t("detail.deleted"));
        router.push("/skills");
      },
    });
  };

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <div style={s.iconBox(style.color, style.bg)}>
          <TypeIcon size={16} />
        </div>
        <h1 className="mono" style={s.h1}>
          {skill.name}
        </h1>
        <Badge color={style.color} bg={style.bg}>
          {t(`listItem.type.${skill.type}`)}
        </Badge>
        <Badge mono>{t("preview.version", { version: skill.version })}</Badge>
        <div style={s.right}>
          {/* A disabled button swallows hover, so the tooltip lives on the wrapper. */}
          <span title={t("detail.evalsTooltip")}>
            <Button kind="secondary" size="sm" icon="Play" disabled>
              {t("detail.runOnEvals")}
            </Button>
          </span>
          <Dropdown
            width={190}
            align="right"
            trigger={<IconBtn icon="MoreHorizontal" label={t("detail.menuLabel")} />}
            items={[{ label: t("detail.delete"), icon: "Trash", onClick: onDelete }]}
          />
        </div>
      </div>
      <div style={s.tabsBar}>
        <Tabs tabs={tabs} value={tab} onChange={onTab} pad="0 24px" />
      </div>
      <div style={s.body}>
        {/* Config stays mounted so unsaved edits survive tab switches (Preview reports them). */}
        <div hidden={tab !== "config"}>
          <ConfigTab
            key={`${skill.id}:${skill.version}`}
            skill={skill}
            importedFile={importedFileName(versions)}
            onDirtyChange={handleDirty}
          />
        </div>
        {tab === "preview" && <PreviewTab skill={skill} hasUnsavedEdits={dirty} />}
        {tab === "evals" && <EvalsTab />}
        {tab === "stats" && <StatsTab skillId={skill.id} />}
        {tab === "versions" && <VersionsTab skill={skill} />}
      </div>
    </div>
  );
}
