/* hooks/skills.ts — React Query hooks for the Skills page and the agent
   editor's Skills tab (server spec: server/specs/skills.md). */
"use client";

import { useQuery, useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  AgentSkill,
  Skill,
  SkillImportDraft,
  SkillInput,
  SkillStats,
  SkillVersion,
  SetAgentSkillsInput,
} from "@devdigest/shared";

/** Fields a skill save can change. `message` is only used when a version is created. */
export type SkillPatch = Partial<SkillInput>;

/** Refresh everything a skill change can touch: the lists, the skill's own
    queries and — because names/enabled flags/order feed agent cards and the
    agent editor — the agent-side caches. */
function invalidateSkill(qc: QueryClient, id?: string) {
  qc.invalidateQueries({ queryKey: ["skills"] });
  if (id) {
    qc.invalidateQueries({ queryKey: ["skill", id] });
    qc.invalidateQueries({ queryKey: ["skill-versions", id] });
    qc.invalidateQueries({ queryKey: ["skill-stats", id] });
  }
  qc.invalidateQueries({ queryKey: ["agent-skills"] });
  qc.invalidateQueries({ queryKey: ["agents"] });
}

export function useSkills() {
  return useQuery({
    queryKey: ["skills"],
    queryFn: () => api.get<Skill[]>("/skills"),
  });
}

export function useSkill(id: string | null | undefined) {
  return useQuery({
    queryKey: ["skill", id],
    queryFn: () => api.get<Skill>(`/skills/${id}`),
    enabled: !!id,
  });
}

export function useCreateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SkillInput) => api.post<Skill>("/skills", input),
    onSuccess: (data) => {
      qc.setQueryData(["skill", data.id], data);
      invalidateSkill(qc, data.id);
    },
  });
}

export function useUpdateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: SkillPatch }) => api.put<Skill>(`/skills/${id}`, patch),
    onSuccess: (data) => {
      qc.setQueryData(["skill", data.id], data);
      invalidateSkill(qc, data.id);
    },
  });
}

export function useDeleteSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<{ ok: boolean }>(`/skills/${id}`),
    onSuccess: (_d, id) => {
      qc.removeQueries({ queryKey: ["skill", id] });
      qc.removeQueries({ queryKey: ["skill-versions", id] });
      qc.removeQueries({ queryKey: ["skill-stats", id] });
      invalidateSkill(qc);
    },
  });
}

export function useSkillVersions(id: string | null | undefined) {
  return useQuery({
    queryKey: ["skill-versions", id],
    queryFn: () => api.get<SkillVersion[]>(`/skills/${id}/versions`),
    enabled: !!id,
  });
}

/** One snapshot. Its key sits under ["skill-versions", id] so a save/restore refreshes it too. */
export function useSkillVersion(id: string | null | undefined, version: number | null | undefined) {
  return useQuery({
    queryKey: ["skill-versions", id, version],
    queryFn: () => api.get<SkillVersion>(`/skills/${id}/versions/${version}`),
    enabled: !!id && version != null,
  });
}

export function useRestoreSkillVersion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) =>
      api.post<Skill>(`/skills/${id}/versions/${version}/restore`),
    onSuccess: (data) => {
      qc.setQueryData(["skill", data.id], data);
      invalidateSkill(qc, data.id);
    },
  });
}

export function useSkillStats(id: string | null | undefined) {
  return useQuery({
    queryKey: ["skill-stats", id],
    queryFn: () => api.get<SkillStats>(`/skills/${id}/stats`),
    enabled: !!id,
  });
}

/** Multipart parse of a `.md` / `.zip`. Never persists — saving is a normal `useCreateSkill`. */
export function useImportSkillPreview() {
  return useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return api.postForm<SkillImportDraft>("/skills/import/preview", form);
    },
  });
}

export function useAgentSkills(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["agent-skills", agentId],
    queryFn: () => api.get<AgentSkill[]>(`/agents/${agentId}/skills`),
    enabled: !!agentId,
  });
}

/** Replace an agent's full ordered skill set. Optimistic: the cache shows the
    new list at once and rolls back if the request fails. */
export function useSetAgentSkills(agentId: string) {
  const qc = useQueryClient();
  const key = ["agent-skills", agentId];
  const mutationKey = ["set-agent-skills", agentId];
  return useMutation({
    mutationKey,
    mutationFn: (next: AgentSkill[]) => {
      const body: SetAgentSkillsInput = {
        items: next.map((a) => ({ skill_id: a.skill.id, enabled: a.enabled })),
      };
      return api.put<unknown>(`/agents/${agentId}/skills`, body);
    },
    onMutate: async (next) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<AgentSkill[]>(key);
      qc.setQueryData<AgentSkill[]>(
        key,
        next.map((a, i) => ({ ...a, order: i })),
      );
      return { previous };
    },
    onError: (_err, _next, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
    },
    onSettled: () => {
      // Only the last in-flight save refetches, so a stale response can't overwrite a newer optimistic list.
      if (qc.isMutating({ mutationKey }) > 1) return;
      qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: ["agents"] });
      qc.invalidateQueries({ queryKey: ["agent", agentId] });
      qc.invalidateQueries({ queryKey: ["skills"] });
    },
  });
}
