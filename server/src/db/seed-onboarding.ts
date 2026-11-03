import type { OnboardingTourContent } from '@devdigest/shared';

/**
 * Stored demo tour for `acme/payments-api` (SPEC-02). The e2e flow reads it
 * (presence only — it never generates), so the texts below are asserted by
 * `e2e/specs/14-onboarding-tour.flow.json`.
 */

/** The commit the demo tour was generated from. */
export const SEED_TOUR_COMMIT_SHA = 'c0ffee00c0ffee00c0ffee00c0ffee00c0ffee00';
/** The index has since moved on, on purpose: the page shows "Repo changed since this tour". */
export const SEED_INDEXED_SHA = 'beef0000beef0000beef0000beef0000beef0000';
export const SEED_INDEX_FILE_COUNT = 12450;

export const SEED_ONBOARDING_TOUR: OnboardingTourContent = {
  architecture: {
    summary_md: [
      'The service boots in `src/server.ts`, which wires the request middleware and mounts the routes under `src/api/*`.',
      'Persistent state lives in Postgres behind the `db` layer; Redis backs rate limiting and sessions.',
    ].join('\n\n'),
    diagram: [
      'flowchart LR',
      '  client["client"] --> server["server.ts"]',
      '  server --> middleware["middleware"]',
      '  middleware --> redis["redis"]',
      '  middleware --> api["api/public/*"]',
      '  api --> postgres["postgres"]',
    ].join('\n'),
    links: [
      { label: 'Server entry', path: 'src/server.ts' },
      { label: 'Auth middleware', path: 'src/middleware/auth.ts' },
    ],
  },
  critical_paths: {
    source: 'critical_paths',
    items: [
      { path: 'src/server.ts', note: null },
      { path: 'src/middleware/auth.ts', note: 'Token validation, used by 14 routes' },
      { path: 'src/api/public/payments.ts', note: null },
    ],
  },
  run_steps: [
    { command: 'pnpm install' },
    { command: 'cp .env.example .env # add OPENAI + STRIPE keys' },
    { command: 'docker compose up -d' },
    { command: 'pnpm dev # http://localhost:3000' },
  ],
  reading_path: [
    { path: 'src/server.ts', reason: 'See the whole request lifecycle in one file' },
    { path: 'src/middleware/auth.ts', reason: 'How a request gets its identity' },
    { path: 'src/api/public/payments.ts', reason: 'A typical public endpoint, end to end' },
  ],
  first_tasks: [
    {
      title: 'Add a request-id header to every response',
      description: 'Generate an id in the middleware chain and return it as `x-request-id`.',
      paths: ['src/server.ts', 'src/middleware/auth.ts'],
    },
    {
      title: 'Document the payments endpoint errors',
      description: 'List the error codes `payments.ts` can return in its route comment.',
      paths: ['src/api/public/payments.ts'],
    },
    {
      title: 'Log a warning when a token is about to expire',
      description: 'Extend the token check to flag tokens with under a minute left.',
      paths: ['src/middleware/auth.ts'],
    },
  ],
};
