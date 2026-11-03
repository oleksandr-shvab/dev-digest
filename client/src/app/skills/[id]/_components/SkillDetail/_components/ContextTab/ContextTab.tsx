/* Skill ContextTab — "Project context to use": docs every agent using this skill
   inherits. Every tick, untick or reorder saves at once (no new skill version). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { Skill } from "@devdigest/shared";
import { ContextDocPicker } from "@/components/context-doc-picker";
import { serializePreview } from "@/components/context-doc-picker/helpers";
import { useProjectContextDocs, useSetSkillContext } from "@/lib/hooks/project-context";
import { useActiveRepo } from "@/lib/repo-context";
import { s } from "./styles";

export function ContextTab({ skill }: { skill: Skill }) {
  const t = useTranslations("context");
  const { activeRepo } = useActiveRepo();
  const repo = activeRepo ? { id: activeRepo.id, full_name: activeRepo.full_name } : null;
  const { data: list, isLoading, isError } = useProjectContextDocs(repo?.id);
  const save = useSetSkillContext(skill.id);
  const attached = skill.context_paths;

  return (
    <>
      <ContextDocPicker
        variant="skill"
        title={t("skill.title")}
        helper={t("skill.helper")}
        badge={t("skill.badge", { count: attached.length })}
        repo={repo}
        docs={list?.docs}
        isLoading={isLoading}
        isError={isError}
        attached={attached}
        onChange={(paths) => save.mutate(paths)}
        saving={save.isPending}
        saveError={save.isError ? t("picker.saveError") : null}
      />
      <div style={s.serializes}>
        <div style={s.label}>{t("skill.serializesAs")}</div>
        <pre className="mono" style={s.box}>
          {serializePreview(attached)}
        </pre>
      </div>
    </>
  );
}
