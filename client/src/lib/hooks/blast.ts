/* hooks/blast.ts — the PR's blast radius (GET /pulls/:id/blast): read-only, no model call, no polling. */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { BlastRadius } from "@devdigest/shared";

/** GET /pulls/:id/blast → the symbols the PR changes, who calls them, and the endpoints/crons behind them. */
export function useBlastRadius(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["blast-radius", prId],
    queryFn: () => api.get<BlastRadius>(`/pulls/${prId}/blast`),
    enabled: !!prId,
  });
}
