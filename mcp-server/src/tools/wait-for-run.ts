import type { RunSummary } from '@devdigest/shared';
import { DevDigestApiError } from '../api/client.js';
import type { DevDigestApi } from '../api/client.js';
import type { Clock } from '../clock.js';

/** The web client's durable fallback is also a 4 s poll (client/CLAUDE.md); ~15 requests/min of the API's 120. */
export const RUN_POLL_INTERVAL_MS = 4_000;

/** Consecutive failed polls that are tolerated; the next one ends the wait. */
const TOLERATED_API_ERRORS = 2;

export type TerminalRunStatus = 'done' | 'failed' | 'cancelled';

export type WaitOutcome =
  | { kind: 'terminal'; status: TerminalRunStatus; run: RunSummary }
  | { kind: 'deadline' }
  | { kind: 'aborted' }
  | { kind: 'missing' }
  | { kind: 'api_error'; error: DevDigestApiError };

export interface WaitForRunOptions {
  api: DevDigestApi;
  pullRequestId: string;
  runId: string;
  /** Absolute time in `clock.now()` units at which the wait ends. */
  deadline: number;
  clock: Clock;
  /** The MCP client's abort signal: when it fires the wait ends at once. */
  signal?: AbortSignal;
}

function terminalStatusOf(run: RunSummary): TerminalRunStatus | null {
  return run.status === 'done' || run.status === 'failed' || run.status === 'cancelled' ? run.status : null;
}

/**
 * Polls `GET /pulls/:id/runs` until the run is terminal, the deadline passes or the client aborts.
 * It only ever reads: it never cancels or deletes the run, so giving up leaves the run going on the API.
 * An in-flight GET is not interrupted, so the answer can arrive up to one request timeout after the deadline.
 */
export async function waitForRun(opts: WaitForRunOptions): Promise<WaitOutcome> {
  const { api, pullRequestId, runId, deadline, clock, signal } = opts;
  let consecutiveErrors = 0;

  for (;;) {
    if (signal?.aborted) return { kind: 'aborted' };
    const remaining = deadline - clock.now();
    if (remaining <= 0) return { kind: 'deadline' };

    // `sleep` resolves early (without throwing) on abort, which the checks around it turn into `aborted`.
    await clock.sleep(Math.min(RUN_POLL_INTERVAL_MS, remaining), signal);
    if (signal?.aborted) return { kind: 'aborted' };

    let runs: RunSummary[];
    try {
      runs = await api.listRuns(pullRequestId);
      consecutiveErrors = 0;
    } catch (err) {
      if (!(err instanceof DevDigestApiError)) throw err;
      consecutiveErrors += 1;
      if (consecutiveErrors > TOLERATED_API_ERRORS) return { kind: 'api_error', error: err };
      continue;
    }
    if (signal?.aborted) return { kind: 'aborted' };

    const run = runs.find((candidate) => candidate.run_id === runId);
    if (!run) return { kind: 'missing' };
    const status = terminalStatusOf(run);
    if (status) return { kind: 'terminal', status, run };
  }
}
