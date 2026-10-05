"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Badge, Checkbox, Icon, IconBtn } from "@devdigest/ui";
import type { AgentSkill } from "@devdigest/shared";
import { SKILL_TYPE_STYLE } from "@/lib/skill-meta";
import { s } from "./styles";

/** One linked skill: drag handle, per-agent checkbox, name link, type chip, hover-revealed unlink. */
export function SkillRow({
  item,
  dragDisabled,
  onToggle,
  onUnlink,
}: {
  item: AgentSkill;
  dragDisabled: boolean;
  onToggle: (enabled: boolean) => void;
  onUnlink: () => void;
}) {
  const t = useTranslations("agents");
  const tSkills = useTranslations("skills");
  const { skill } = item;
  const [hover, setHover] = React.useState(false);
  const [focus, setFocus] = React.useState(false);
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: skill.id,
    disabled: dragDisabled,
  });
  const style = SKILL_TYPE_STYLE[skill.type];
  const muted = !skill.enabled;

  return (
    <div
      ref={setNodeRef}
      style={{ ...s.row(isDragging), transform: CSS.Transform.toString(transform), transition, opacity: muted ? 0.6 : 1 }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setFocus(true)}
      onBlur={() => setFocus(false)}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        aria-label={t("skills.dragHandle", { name: skill.name })}
        style={s.handle(dragDisabled)}
        {...attributes}
        {...listeners}
      >
        <Icon.GripVertical size={16} />
      </button>
      <Checkbox
        checked={item.enabled}
        onChange={onToggle}
        label={<span style={s.srOnly}>{t("skills.enable", { name: skill.name })}</span>}
      />
      <Link href={`/skills/${skill.id}`} className="mono" style={s.name(muted)}>
        {skill.name}
      </Link>
      {muted && <Badge color="var(--text-muted)">{t("skills.disabledGlobally")}</Badge>}
      <span style={s.spacer} />
      <Badge color={style.color} bg={style.bg}>
        {tSkills(`listItem.type.${skill.type}`)}
      </Badge>
      <span style={s.unlink(hover || focus)}>
        <IconBtn icon="X" label={t("skills.unlink", { name: skill.name })} size={26} danger onClick={onUnlink} />
      </span>
    </div>
  );
}
