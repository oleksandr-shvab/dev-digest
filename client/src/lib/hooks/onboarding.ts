/* hooks/onboarding.ts — React Query hooks for the Onboarding Tour page.
   The tour is read with a plain GET (no LLM call); generation is an explicit
   POST that answers 202 and runs on the server, so the page polls the state
   every 2 s, and only while a generation is running. */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { OnboardingTourState } from "@devdigest/shared";

/** Poll interval of the tour state while `generating` is true. */
const TOUR_POLL_MS = 2000;

const tourKey = (repoId: string | null | undefined) => ["onboarding-tour", repoId] as const;

export function useOnboardingTour(repoId: string | null | undefined) {
  return useQuery({
    queryKey: tourKey(repoId),
    queryFn: () => api.get<OnboardingTourState>(`/repos/${repoId}/onboarding`),
    enabled: !!repoId,
    refetchInterval: (q) => (q.state.data?.generating ? TOUR_POLL_MS : false),
  });
}

export function useGenerateOnboardingTour(repoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<OnboardingTourState>(`/repos/${repoId}/onboarding/generate`),
    onSuccess: (state) => {
      qc.setQueryData(tourKey(repoId), state);
    },
    // 409 (already running / index not ready): the server state is the truth, re-read it.
    onError: () => {
      qc.invalidateQueries({ queryKey: tourKey(repoId) });
    },
  });
}
