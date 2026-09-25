/* SkillCard — one row of the Skills list: type icon, mono name, global enabled
   toggle, one-line description, type chip + source, and a 30-day stats footer. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Badge, Toggle } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { SKILL_SOURCE_ICON, SKILL_TYPE_STYLE, acceptColor, formatRate } from "@/lib/skill-meta";
import { s } from "./styles";

export function SkillCard({
  skill,
  active,
  onClick,
  onToggle,
}: {
  skill: Skill;
  active?: boolean;
  onClick?: () => void;
  onToggle?: (enabled: boolean) => void;
}) {
  const t = useTranslations("skills");
  const style = SKILL_TYPE_STYLE[skill.type];
  const TypeIcon = Icon[style.icon];
  const SourceIcon = Icon[SKILL_SOURCE_ICON[skill.source]];
  const stats = skill.stats;
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={!!active}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) onClick?.();
      }}
      style={s.card(!!active, skill.enabled)}
    >
      <div style={s.headerRow}>
        <div style={s.iconBox(style.color, style.bg)}>
          <TypeIcon size={15} />
        </div>
        <span className="mono" style={s.name}>
          {skill.name}
        </span>
        {onToggle && (
          // The toggle is a global kill-switch and must not select the card.
          <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
            <Toggle on={skill.enabled} onChange={onToggle} size={14} label={t("card.toggle", { name: skill.name })} />
          </div>
        )}
      </div>
      <div style={s.description}>{skill.description || t("card.noDescription")}</div>
      <div style={s.metaRow}>
        <Badge color={style.color} bg={style.bg}>
          {t(`listItem.type.${skill.type}`)}
        </Badge>
        <span style={s.source}>
          <SourceIcon size={12} />
          {t(`listItem.source.${skill.source}`)}
        </span>
      </div>
      {stats && (
        <div style={s.footer}>
          {t.rich("card.footer", {
            agents: t("card.agents", { count: stats.used_by }),
            pull: formatRate(stats.pull_rate),
            rate: formatRate(stats.accept_rate),
            accept: (chunks) => <span style={s.accept(acceptColor(stats.accept_rate))}>{chunks}</span>,
          })}
        </div>
      )}
    </div>
  );
}
