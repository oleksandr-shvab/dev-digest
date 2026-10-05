/* SkillsApplied — compact list of the skills that were part of this run's
   prompt (`name v5 · 410 tok`), shown under the Skills prompt block. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import type { RunTrace } from "@devdigest/shared";
import { s } from "../../styles";

type Applied = NonNullable<RunTrace["skills_applied"]>;

export function SkillsApplied({ skills }: { skills: Applied }) {
  const t = useTranslations("runs");
  if (skills.length === 0) return null;
  return (
    <div style={s.skillsApplied}>
      <div style={s.skillsAppliedTitle}>{t("trace.prompt.skillsApplied")}</div>
      <ul style={s.skillsAppliedList}>
        {skills.map((sk) => (
          <li key={sk.id} className="mono" style={s.skillsAppliedItem}>
            {t("trace.skillLine", { name: sk.name, version: sk.version, tokens: sk.tokens })}
            {sk.source === "imported_file" || sk.source === "imported_url" ? (
              <Badge color="var(--warn)" bg="var(--warn-bg)">
                {t("trace.skillImported")}
              </Badge>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
