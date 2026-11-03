import type { AgentSkill } from "@devdigest/shared";
import type { InheritedDoc } from "@/components/context-doc-picker";

/** Docs an agent receives through its skills: only links whose link flag AND skill flag are on,
    in the agent's skill order, each skill's paths minus those already attached or already inherited. */
export function inheritedDocs(links: AgentSkill[], ownPaths: string[]): InheritedDoc[] {
  const seen = new Set(ownPaths);
  const out: InheritedDoc[] = [];
  for (const link of links) {
    if (!link.enabled || !link.skill.enabled) continue;
    for (const path of link.skill.context_paths) {
      if (seen.has(path)) continue;
      seen.add(path);
      out.push({ path, via: link.skill.name });
    }
  }
  return out;
}
