/* Agent SkillsTab — linked skills in prompt order. Every change (toggle,
   reorder, link, unlink) saves immediately through an optimistic PUT. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Badge, EmptyState, ErrorState, Icon, SearchableSelect, Skeleton } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { useAgentSkills, useSetAgentSkills, useSkills } from "@/lib/hooks/skills";
import { SKILL_TOKEN_WARN } from "@/lib/tokens";
import { SkillRow } from "./_components/SkillRow";
import { DND_ID } from "./constants";
import { countActive, filterLinked, link, linkableOptions, toggleEnabled, totalTokens, unlink } from "./helpers";
import { s } from "./styles";

export function SkillsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const { data: items, isLoading, isError, refetch } = useAgentSkills(agent.id);
  const { data: allSkills } = useSkills();
  const save = useSetAgentSkills(agent.id);
  const [filter, setFilter] = React.useState("");
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (isLoading) return <Skeleton height={160} />;
  if (isError || !items) return <ErrorState body={t("skills.loadError")} onRetry={() => refetch()} />;

  const tokens = totalTokens(items);
  const overBudget = tokens > SKILL_TOKEN_WARN;
  // Reordering a filtered subset is ambiguous, so dragging is off while filtering.
  const filtering = filter.trim() !== "";
  const visible = filterLinked(items, filter);

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = items.findIndex((a) => a.skill.id === active.id);
    const to = items.findIndex((a) => a.skill.id === over.id);
    if (from < 0 || to < 0) return;
    save.mutate(arrayMove(items, from, to));
  };

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("skills.title")}</h2>
        <Badge>{t("skills.enabledCount", { enabled: countActive(items), linked: items.length })}</Badge>
        <span className="tnum" style={s.tokens(overBudget)}>
          {t("skills.tokens", { count: tokens })}
        </span>
        <div style={s.filter}>
          <Icon.Search size={13} style={s.filterIcon} />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t("skills.filterPlaceholder")}
            aria-label={t("skills.filterPlaceholder")}
            style={s.filterInput}
          />
        </div>
      </div>
      <p style={s.caption}>{t("skills.orderHint")}</p>
      {overBudget && (
        <div role="note" style={s.warn}>
          {t("skills.tokenWarn", { limit: SKILL_TOKEN_WARN.toLocaleString("en-US") })}
        </div>
      )}

      {items.length === 0 ? (
        <EmptyState icon="Sparkles" title={t("skills.emptyTitle")} body={t("skills.emptyBody")} />
      ) : (
        <div style={s.list}>
          <DndContext id={DND_ID} sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={visible.map((a) => a.skill.id)} strategy={verticalListSortingStrategy}>
              {visible.map((a) => (
                <SkillRow
                  key={a.skill.id}
                  item={a}
                  dragDisabled={filtering}
                  onToggle={(enabled) => save.mutate(toggleEnabled(items, a.skill.id, enabled))}
                  onUnlink={() => save.mutate(unlink(items, a.skill.id))}
                />
              ))}
            </SortableContext>
          </DndContext>
          {visible.length === 0 && <div style={s.muted}>{t("skills.noMatch")}</div>}
        </div>
      )}

      <div style={s.link}>
        <SearchableSelect
          value=""
          mono={false}
          placeholder={t("skills.linkSkill")}
          options={linkableOptions(allSkills ?? [], items)}
          onChange={(id) => {
            const skill = allSkills?.find((sk) => sk.id === id);
            if (skill) save.mutate(link(items, skill));
          }}
        />
      </div>
    </div>
  );
}
