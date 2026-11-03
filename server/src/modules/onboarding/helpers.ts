import { ZodError } from 'zod';
import {
  OnboardingTourContent,
  type OnboardingIndexReadiness,
  type OnboardingTour,
} from '@devdigest/shared';
import { ConfigError } from '../../platform/errors.js';
import { TimeoutError } from '../../platform/resilience.js';
import type { IndexState } from '../repo-intel/types.js';
import type { OnboardingRow } from './repository.js';

/** The slice of the request logger the service needs. */
export type TourLogger = {
  info(obj: object, msg: string): void;
  warn(obj: object, msg: string): void;
};

const REASON_MAX_CHARS = 200;

/** The one-line reason the page shows after a failed generation (AC-22, AC-32). */
export function failureReason(err: unknown): string {
  if (err instanceof TimeoutError) return 'timed out';
  if (err instanceof ConfigError) return err.message;
  const message = err instanceof Error ? err.message : String(err);
  if (err instanceof ZodError || /schema validation/i.test(message)) {
    return 'output failed validation';
  }
  return `provider error: ${message}`.slice(0, REASON_MAX_CHARS);
}

/** Whether a tour can be generated now, and the index facts the page shows (AC-23). */
export function readinessOf({
  mirrorOk,
  state,
}: {
  mirrorOk: boolean;
  state: IndexState;
}): OnboardingIndexReadiness {
  const noData =
    state.degradedReason === 'no_data' || state.lastIndexedSha === '' || state.filesIndexed === 0;
  const reason = !mirrorOk
    ? ('no_mirror' as const)
    : state.status === 'failed'
      ? ('index_failed' as const)
      : noData
        ? ('no_data' as const)
        : null;
  return {
    ready: reason === null,
    reason,
    status: noData ? null : state.status,
    indexed_sha: noData ? null : state.lastIndexedSha,
    file_count: state.filesIndexed,
  };
}

/** The stored row as the API tour, or `null` for a legacy row or unreadable JSON. */
export function toTourDto(row: OnboardingRow | undefined): OnboardingTour | null {
  if (!row || row.commitSha === null || row.indexFileCount === null || row.indexStatus === null) {
    return null;
  }
  const content = OnboardingTourContent.safeParse(row.json);
  if (!content.success) return null;
  return {
    ...content.data,
    repo_id: row.repoId,
    generated_at: row.generatedAt.toISOString(),
    commit_sha: row.commitSha,
    index_file_count: row.indexFileCount,
    index_status: row.indexStatus,
  };
}
