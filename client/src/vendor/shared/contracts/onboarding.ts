import { z } from 'zod';

/**
 * Onboarding tour — one stored, per-repo, five-part tour and the state the
 * page reads (stored tour + generation status + index readiness).
 */

export const OnboardingLink = z.object({
  label: z.string(),
  path: z.string(),
});
export type OnboardingLink = z.infer<typeof OnboardingLink>;

export const OnboardingIndexStatus = z.enum(['full', 'partial', 'degraded', 'failed']);
export type OnboardingIndexStatus = z.infer<typeof OnboardingIndexStatus>;

/** Where Critical paths came from: the index's critical chains, or a plain file-rank fallback. */
export const OnboardingCriticalPathSource = z.enum(['critical_paths', 'file_rank']);
export type OnboardingCriticalPathSource = z.infer<typeof OnboardingCriticalPathSource>;

/** The grounded tour body — what the `onboarding.json` column holds. */
export const OnboardingTourContent = z.object({
  architecture: z.object({
    summary_md: z.string(),
    diagram: z.string().nullable(), // mermaid
    links: z.array(OnboardingLink),
  }),
  critical_paths: z.object({
    source: OnboardingCriticalPathSource,
    items: z.array(z.object({ path: z.string(), note: z.string().nullable() })),
  }),
  run_steps: z.array(z.object({ command: z.string() })),
  reading_path: z.array(z.object({ path: z.string(), reason: z.string().nullable() })),
  first_tasks: z.array(
    z.object({
      title: z.string(),
      description: z.string(),
      paths: z.array(z.string()),
    }),
  ),
});
export type OnboardingTourContent = z.infer<typeof OnboardingTourContent>;

/** The stored tour plus the repo/index facts it was generated from. */
export const OnboardingTour = OnboardingTourContent.extend({
  repo_id: z.string(),
  generated_at: z.string(),
  commit_sha: z.string(),
  index_file_count: z.number().int(),
  index_status: OnboardingIndexStatus,
});
export type OnboardingTour = z.infer<typeof OnboardingTour>;

export const OnboardingIndexReadiness = z.object({
  ready: z.boolean(),
  reason: z.enum(['no_mirror', 'index_failed', 'no_data']).nullable(),
  status: OnboardingIndexStatus.nullable(),
  indexed_sha: z.string().nullable(),
  file_count: z.number().int(),
});
export type OnboardingIndexReadiness = z.infer<typeof OnboardingIndexReadiness>;

/** Response of GET /repos/:id/onboarding and POST /repos/:id/onboarding/generate. */
export const OnboardingTourState = z.object({
  repo_id: z.string(),
  tour: OnboardingTour.nullable(),
  generating: z.boolean(),
  last_error: z.string().nullable(),
  index: OnboardingIndexReadiness,
});
export type OnboardingTourState = z.infer<typeof OnboardingTourState>;
