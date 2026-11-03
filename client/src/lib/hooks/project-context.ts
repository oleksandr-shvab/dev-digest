/* hooks/project-context.ts — React Query hooks for Project Context: the repo's
   Markdown docs (read-only) and the paths attached to an agent or a skill. */
"use client";

import { useQuery, useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  Agent,
  ProjectContextDocContent,
  ProjectContextList,
  SetContextPathsInput,
  Skill,
} from "@devdigest/shared";

const DOCS_KEY = "project-context-docs";

export function useProjectContextDocs(repoId: string | null | undefined) {
  return useQuery({
    queryKey: [DOCS_KEY, repoId],
    queryFn: () => api.get<ProjectContextList>(`/repos/${repoId}/context/docs`),
    enabled: !!repoId,
  });
}

export function useProjectContextDoc(repoId: string | null | undefined, path: string | null | undefined) {
  return useQuery({
    queryKey: ["project-context-doc", repoId, path],
    queryFn: () =>
      api.get<ProjectContextDocContent>(
        `/repos/${repoId}/context/docs/content?path=${encodeURIComponent(path ?? "")}`,
      ),
    enabled: !!repoId && !!path,
  });
}

/** Refresh what an attachment change can touch: "Used by" counts and inherited rows. */
function invalidateAfterAttach(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: [DOCS_KEY] });
  qc.invalidateQueries({ queryKey: ["agent-skills"] });
}

interface ContextMutationOptions {
  /** Cache key of the single agent/skill entry, e.g. `["agent", id]`. */
  entryKey: readonly unknown[];
  mutationKey: readonly unknown[];
  endpoint: string;
  /** Cache key of the agent/skill list. */
  listKey: readonly unknown[];
}

/** Shared optimistic "replace the attached paths" mutation. Only the last in-flight
    save refetches, so a stale response can't overwrite a newer optimistic list. */
function useSetContext<T extends { context_paths: string[] }>({
  entryKey,
  mutationKey,
  endpoint,
  listKey,
}: ContextMutationOptions) {
  const qc = useQueryClient();
  return useMutation({
    mutationKey,
    mutationFn: (paths: string[]) => {
      const body: SetContextPathsInput = { paths };
      return api.put<T>(endpoint, body);
    },
    onMutate: async (paths) => {
      await qc.cancelQueries({ queryKey: entryKey });
      const previous = qc.getQueryData<T>(entryKey);
      if (previous) qc.setQueryData<T>(entryKey, { ...previous, context_paths: paths });
      return { previous };
    },
    onError: (_err, _paths, ctx) => {
      if (ctx?.previous) qc.setQueryData(entryKey, ctx.previous);
    },
    onSettled: () => {
      if (qc.isMutating({ mutationKey }) > 1) return;
      qc.invalidateQueries({ queryKey: entryKey });
      qc.invalidateQueries({ queryKey: listKey });
      invalidateAfterAttach(qc);
    },
  });
}

/** Replace an agent's attached doc paths (saves immediately; no new agent version). */
export function useSetAgentContext(agentId: string) {
  return useSetContext<Agent>({
    entryKey: ["agent", agentId],
    mutationKey: ["set-agent-context", agentId],
    endpoint: `/agents/${agentId}/context`,
    listKey: ["agents"],
  });
}

/** Replace a skill's attached doc paths (saves immediately; no new skill version). */
export function useSetSkillContext(skillId: string) {
  return useSetContext<Skill>({
    entryKey: ["skill", skillId],
    mutationKey: ["set-skill-context", skillId],
    endpoint: `/skills/${skillId}/context`,
    listKey: ["skills"],
  });
}
