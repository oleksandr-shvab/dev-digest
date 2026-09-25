import { SkillsListView } from "./_components/SkillsListView";

/* Route: /skills (nothing selected). Thin route entry — the master-detail view,
   its cards, import modal, styles and helpers are colocated under _components. */
export default function SkillsPage() {
  return <SkillsListView />;
}
