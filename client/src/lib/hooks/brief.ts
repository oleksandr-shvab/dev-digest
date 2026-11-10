/* hooks/brief.ts — React Query hooks for the PR Brief block.
   The brief is read with a plain GET (no LLM call); generation is an explicit
   POST that answers 202 and runs on the server, so the state is polled every
   2 s, and only while a generation is running (a reload mid-run resumes it). */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { PrBriefState } from "@devdigest/shared";

/** Poll interval of the brief state while `generating` is true. */
export const BRIEF_POLL_MS = 2000;

export const briefKey = (prId: string | null | undefined) => ["pr-brief", prId] as const;

export function usePrBrief(prId: string | null | undefined) {
  return useQuery({
    queryKey: briefKey(prId),
    queryFn: () => api.get<PrBriefState>(`/pulls/${prId}/brief`),
    enabled: !!prId,
    refetchInterval: (q) => (q.state.data?.generating ? BRIEF_POLL_MS : false),
  });
}

export function useGeneratePrBrief(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<PrBriefState>(`/pulls/${prId}/brief`),
    onSuccess: (state) => {
      qc.setQueryData(briefKey(prId), state);
    },
    // 409 (already running / no changed files): the server state is the truth, re-read it.
    onError: () => {
      qc.invalidateQueries({ queryKey: briefKey(prId) });
    },
  });
}
