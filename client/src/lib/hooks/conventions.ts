/* hooks/conventions.ts — React Query hooks for the Conventions page
   (server spec: server/specs/conventions.md, client spec: client/specs/conventions.md). */
"use client";

import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  ConventionCandidate,
  ConventionPatch,
  ConventionScanResult,
  ConventionSkillDraft,
  CreateConventionSkill,
  Skill,
} from "@devdigest/shared";

export function useConventions(repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["conventions", repoId],
    queryFn: () => api.get<ConventionCandidate[]>(`/repos/${repoId}/conventions`),
    enabled: !!repoId,
  });
}

export function useExtractConventions(repoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<ConventionScanResult>(`/repos/${repoId}/conventions/extract`),
    onSuccess: (data) => {
      qc.setQueryData(["conventions", repoId], data.candidates);
    },
  });
}

/** Optimistic accept/reject/edit: the card updates (or, on reject, disappears) at once. */
export function useUpdateConvention(repoId: string) {
  const qc = useQueryClient();
  const key = ["conventions", repoId];
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: ConventionPatch }) =>
      api.patch<ConventionCandidate>(`/conventions/${id}`, patch),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<ConventionCandidate[]>(key);
      qc.setQueryData<ConventionCandidate[]>(key, (list) =>
        (list ?? [])
          .map((c) => (c.id === id ? { ...c, ...patch, edited: c.edited || patch.rule != null || patch.category != null } : c))
          .filter((c) => c.status !== "rejected"),
      );
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
}

export function useConventionSkillDraft(repoId: string) {
  return useMutation({
    mutationFn: (candidateIds: string[]) =>
      api.post<ConventionSkillDraft>(`/repos/${repoId}/conventions/skill-draft`, { candidate_ids: candidateIds }),
  });
}

function invalidateAfterSkillCreate(qc: QueryClient, agentIds: string[]) {
  qc.invalidateQueries({ queryKey: ["skills"] });
  qc.invalidateQueries({ queryKey: ["agents"] });
  for (const agentId of agentIds) qc.invalidateQueries({ queryKey: ["agent-skills", agentId] });
}

export function useCreateConventionSkill(repoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateConventionSkill) => api.post<Skill>(`/repos/${repoId}/conventions/skill`, input),
    onSuccess: (_data, input) => invalidateAfterSkillCreate(qc, input.agent_ids),
  });
}
