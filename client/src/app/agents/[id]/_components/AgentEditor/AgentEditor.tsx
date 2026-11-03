/* AgentEditor — agent editor shell: Config (model + system prompt), Skills and
   Context tabs. Later lessons add Evals/Stats/CI. Tab state lives in ?tab=. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Tabs } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { ConfigTab } from "./_components/ConfigTab";
import { ContextTab } from "./_components/ContextTab";
import { SkillsTab } from "./_components/SkillsTab";
import { TABS } from "./constants";
import { s } from "./styles";

/** Tab key → body; an unknown key falls back to Config. */
const TAB_BODIES: Record<string, React.ComponentType<{ agent: Agent }>> = {
  skills: SkillsTab,
  context: ContextTab,
};

export function AgentEditor({ agent, tab, onTab }: { agent: Agent; tab: string; onTab: (t: string) => void }) {
  const t = useTranslations("agents");
  const TabBody = TAB_BODIES[tab] ?? ConfigTab;
  const tabs = TABS.map((tb) => ({ key: tb.key, label: t(tb.labelKey), icon: tb.icon }));
  return (
    <div style={s.wrap}>
      <div style={s.tabsBar}>
        <Tabs tabs={tabs} value={tab} onChange={onTab} pad="0 24px" />
      </div>
      <div style={s.body}>
        <TabBody agent={agent} />
      </div>
    </div>
  );
}
