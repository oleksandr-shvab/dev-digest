/* /skills/:id — Skills master-detail with the selected skill's tabs in the
   right pane. Tab state lives in ?tab=. `/skills/new` is handled here too
   (id === "new" → empty Config form). */
"use client";

import React from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { SkillsListView } from "../_components/SkillsListView";
import { SkillDetail } from "./_components/SkillDetail";
import { DEFAULT_TAB, VALID_TABS } from "./_components/SkillDetail/constants";

export default function SkillPage() {
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const [dirty, setDirty] = React.useState(false);

  const requested = search.get("tab") ?? "";
  const tab = VALID_TABS.includes(requested) ? requested : DEFAULT_TAB;
  const setTab = (next: string) => {
    const sp = new URLSearchParams(search.toString());
    sp.set("tab", next);
    router.replace(`/skills/${id}?${sp.toString()}`);
  };

  return (
    <SkillsListView selectedId={id} dirty={dirty}>
      <SkillDetail id={id} tab={tab} onTab={setTab} onDirtyChange={setDirty} />
    </SkillsListView>
  );
}
