/* Agent ContextTab — attach repo docs to this agent. Every tick, untick or reorder
   saves at once (no new agent version). Docs inherited from enabled linked skills
   are read-only rows and count toward the total and the budget warning. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { Agent } from "@devdigest/shared";
import { ContextDocPicker } from "@/components/context-doc-picker";
import { costedDocs, planBudget, totalTokens } from "@/components/context-doc-picker/helpers";
import { useAgentSkills } from "@/lib/hooks/skills";
import { useProjectContextDocs, useSetAgentContext } from "@/lib/hooks/project-context";
import { useActiveRepo } from "@/lib/repo-context";
import { inheritedDocs } from "./helpers";
import { s } from "./styles";

export function ContextTab({ agent }: { agent: Agent }) {
  const t = useTranslations("context");
  const { activeRepo } = useActiveRepo();
  const repo = activeRepo ? { id: activeRepo.id, full_name: activeRepo.full_name } : null;
  const { data: list, isLoading, isError } = useProjectContextDocs(repo?.id);
  const { data: links } = useAgentSkills(agent.id);
  const save = useSetAgentContext(agent.id);

  const attached = agent.context_paths;
  const inherited = inheritedDocs(links ?? [], attached);
  const ordered = costedDocs(list?.docs, [...attached, ...inherited.map((d) => d.path)]);
  const tokens = totalTokens(ordered);
  const skipped = list ? planBudget(ordered, list.budget_tokens).skipped : [];

  return (
    <ContextDocPicker
      variant="agent"
      title={t("agent.title")}
      helper={t("agent.helper")}
      badge={t("agent.badge", { count: attached.length + inherited.length, total: list?.docs.length ?? 0 })}
      repo={repo}
      docs={list?.docs}
      isLoading={isLoading}
      isError={isError}
      attached={attached}
      inherited={inherited}
      onChange={(paths) => save.mutate(paths)}
      saving={save.isPending}
      saveError={save.isError ? t("picker.saveError") : null}
      footer={
        <div style={s.footer}>
          <div aria-live="polite">
            {skipped.length > 0 && list && (
              <div style={s.warn}>
                {t("agent.budgetWarning", {
                  budget: list.budget_tokens.toLocaleString("en-US"),
                  docs: skipped.map((d) => d.path).join(", "),
                })}
              </div>
            )}
          </div>
          <span className="tnum">{t("agent.footer", { tokens })}</span>
        </div>
      }
    />
  );
}
