import React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRepoIntelStatus, useResyncRepoIntel } from "@/lib/hooks";
import { RESYNC_POLL_TIMEOUT_MS } from "../constants";

/** One resync attempt: the index state's `updatedAt` when it started, when it started,
    and whether the wait ran out (stored so it can switch off the poll that produced it). */
interface Attempt {
  updatedAt: string;
  startedAt: number;
  expired: boolean;
}

/** Resync the repo's index and refresh the blast radius once the index state advances.
    Reuses the existing index-state poll (`useRepoIntelStatus`) — no new polling mechanism. */
export function useBlastResync(repoId: string, prId: string) {
  const qc = useQueryClient();
  const [attempt, setAttempt] = React.useState<Attempt | null>(null);
  const status = useRepoIntelStatus(repoId, attempt !== null && !attempt.expired);
  const mutation = useResyncRepoIntel(repoId);

  // Derived during render: only `attempt` is stored.
  const running = attempt !== null && !attempt.expired;
  const timedOut = attempt?.expired === true;
  const advanced = attempt !== null && status.data !== undefined && status.data.updatedAt !== attempt.updatedAt;
  const overdue =
    attempt !== null && !attempt.expired && !advanced && status.dataUpdatedAt - attempt.startedAt > RESYNC_POLL_TIMEOUT_MS;
  const canStart = status.data !== undefined && !running;

  // External system: the server's index state, observed by polling. `expired` is stored
  // because it must switch off the very poll that produced the evidence for it.
  React.useEffect(() => {
    if (advanced) {
      qc.invalidateQueries({ queryKey: ["blast-radius", prId] });
      setAttempt(null);
    } else if (overdue) {
      setAttempt((a) => (a ? { ...a, expired: true } : a));
    }
  }, [advanced, overdue, prId, qc]);

  const start = () => {
    if (!status.data) return;
    setAttempt({ updatedAt: status.data.updatedAt, startedAt: Date.now(), expired: false });
    // The mutation error is already toasted by the QueryClient (src/lib/providers.tsx).
    mutation.mutate(undefined, { onError: () => setAttempt(null) });
  };

  return { start, canStart, running, timedOut };
}
