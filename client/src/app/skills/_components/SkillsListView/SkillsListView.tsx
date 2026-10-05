/* /skills — master-detail Skills view. Card list on the left (search, add /
   import), the selected skill (`children`) on the right. Routes /skills,
   /skills/[id] and /skills/new all render this shell. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Dropdown, EmptyState, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { useSkills, useUpdateSkill } from "@/lib/hooks/skills";
import { SkillCard } from "../SkillCard";
import { ImportSkillModal } from "./_components/ImportSkillModal";
import { filterSkills } from "./helpers";
import { s } from "./styles";

export function SkillsListView({
  selectedId,
  dirty = false,
  children,
}: {
  /** Skill shown in the right pane (`"new"` for the empty create form). */
  selectedId?: string | null;
  /** The right pane has unsaved edits — leaving asks for confirmation. */
  dirty?: boolean;
  children?: React.ReactNode;
}) {
  const t = useTranslations("skills");
  const router = useRouter();
  const { data: skills, isLoading, isError, refetch } = useSkills();
  const update = useUpdateSkill();
  const [importing, setImporting] = React.useState(false);
  const [search, setSearch] = React.useState("");

  const list = filterSkills(skills ?? [], search);
  const noSkills = !isLoading && !isError && (skills?.length ?? 0) === 0;

  // Every in-app exit from the detail pane goes through here so unsaved edits are guarded.
  const go = (href: string) => {
    if (dirty && !window.confirm(t("config.leaveConfirm"))) return;
    router.push(href);
  };
  const openImport = () => {
    if (dirty && !window.confirm(t("config.leaveConfirm"))) return;
    setImporting(true);
  };

  return (
    <AppShell crumb={[{ label: t("page.crumbLab") }, { label: t("page.crumbSkills") }]}>
      {importing && (
        <ImportSkillModal
          onClose={() => setImporting(false)}
          onSaved={(skill) => {
            setImporting(false);
            router.push(`/skills/${skill.id}?tab=preview`);
          }}
        />
      )}
      <div style={s.layout}>
        <div style={s.listPane}>
          <div style={s.listHead}>
            <div style={s.titleRow}>
              <h1 style={s.h1}>{t("page.heading")}</h1>
              <Dropdown
                width={220}
                align="right"
                trigger={
                  <Button kind="primary" size="sm" icon="Plus" iconRight="ChevronDown">
                    {t("page.addSkill")}
                  </Button>
                }
                items={[
                  { label: t("page.createSkill"), icon: "Edit", onClick: () => go("/skills/new") },
                  { label: t("page.menu.fromFile"), icon: "Upload", onClick: openImport },
                ]}
              />
            </div>
            <div style={s.search}>
              <Icon.Search size={13} style={s.searchIcon} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("page.searchPlaceholder")}
                aria-label={t("page.searchPlaceholder")}
                style={s.searchInput}
              />
            </div>
          </div>
          <div style={s.listBody}>
            {isLoading && (
              <div style={s.skeletons}>
                <Skeleton height={110} />
                <Skeleton height={110} />
                <Skeleton height={110} />
              </div>
            )}
            {isError && <ErrorState body={t("page.loadError")} onRetry={() => refetch()} />}
            {noSkills && (
              <>
                <EmptyState
                  icon="Sparkles"
                  title={t("page.empty.title")}
                  body={t("page.empty.body")}
                  cta={t("page.empty.cta")}
                  onCta={() => go("/skills/new")}
                />
                <div style={s.emptyActions}>
                  <Button kind="ghost" icon="Upload" onClick={openImport}>
                    {t("page.empty.importCta")}
                  </Button>
                </div>
              </>
            )}
            {list.map((sk) => (
              <SkillCard
                key={sk.id}
                skill={sk}
                active={sk.id === selectedId}
                onClick={() => sk.id !== selectedId && go(`/skills/${sk.id}`)}
                onToggle={(enabled) => update.mutate({ id: sk.id, patch: { enabled } })}
              />
            ))}
          </div>
        </div>
        <div style={s.detailPane}>
          {children ?? <EmptyState icon="Sparkles" title={t("page.selectPrompt.title")} body={t("page.selectPrompt.body")} />}
        </div>
      </div>
    </AppShell>
  );
}
