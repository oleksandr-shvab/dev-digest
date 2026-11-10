import type { PrBrief } from '@devdigest/shared';

/**
 * Stored demo PR Brief for PR #482 of `acme/payments-api` (SPEC-03), plus real
 * unified-diff patches for its seeded `pr_files`. The e2e flow reads them
 * (presence only — it never generates), so the texts below are asserted by
 * `e2e/specs/15-pr-brief.flow.json`.
 */

/** The seeded PR's head commit: the brief is generated for it, so it is not stale. */
export const SEED_BRIEF_HEAD_SHA = 'a1b2c3d4e5f6';

/**
 * Patches per seeded changed file. Line 12 of `src/config.ts` is the line the
 * seeded CRITICAL finding points at, and carries a marker text the e2e flow
 * waits for (no quoted literal, so the secret scanner stays quiet).
 */
export const SEED_PR_FILE_PATCHES: Record<string, string> = {
  'src/middleware/ratelimit.ts': [
    '@@ -0,0 +1,6 @@',
    '+export function tokenBucket(capacity: number, refillPerSec: number) {',
    '+  let tokens = capacity;',
    '+  let last = Date.now();',
    '+  return () => {',
    '+    const now = Date.now();',
    '+    tokens = Math.min(capacity, tokens + ((now - last) / 1000) * refillPerSec);',
  ].join('\n'),
  'src/config.ts': [
    '@@ -9,3 +9,6 @@',
    '   port: Number(process.env.PORT ?? 3000),',
    '   databaseUrl: process.env.DATABASE_URL,',
    '   logLevel: process.env.LOG_LEVEL,',
    '+  stripeLiveKey: loadDemoKey(), // seeded demo line 12',
    '+  rateLimitPerMinute: 120,',
    '+  rateLimitBurst: 20,',
  ].join('\n'),
  'src/api/public/webhooks.ts': [
    '@@ -20,4 +20,5 @@',
    ' const publicRouter = Router();',
    ' publicRouter.use(parseJson);',
    '+publicRouter.use(rateLimit);',
    ' publicRouter.post("/stripe", handleStripe);',
    ' publicRouter.post("/paypal", handlePaypal);',
  ].join('\n'),
  'src/api/users.ts': [
    '@@ -44,3 +44,9 @@',
    ' export async function listUsers(ids: string[]) {',
    '+  const users = [];',
    '+  for (const id of ids) {',
    '+    users.push(await db.users.findById(id));',
    '+  }',
    '+  const active = users.filter((u) => u.active);',
    '+  const sorted = active.sort((a, b) => a.name.localeCompare(b.name));',
    '   return sorted;',
    ' }',
  ].join('\n'),
};

export const SEED_PR_BRIEF: PrBrief = {
  summary:
    'Adds a token-bucket rate limiter in front of the public API so unauthenticated clients cannot flood it. The limiter is mounted on the public webhook router and tuned through new config values, which also carry a plaintext secret that should not be committed.',
  risks: [
    {
      kind: 'security',
      title: 'Secret set in plaintext in config',
      explanation:
        'A live payment key is assigned directly in the config module. Anyone with read access to the repository can use it, so it has to move to an environment variable and be rotated.',
      severity: 'high',
      file_refs: ['src/config.ts'],
    },
    {
      kind: 'behavior',
      title: 'Limiter runs on every public request',
      explanation:
        'The limiter is attached to the whole public router, so webhook callbacks from payment providers count against the same budget as anonymous traffic and may be throttled during a burst.',
      severity: 'medium',
      file_refs: ['src/middleware/ratelimit.ts', 'src/api/public/webhooks.ts'],
    },
  ],
  review_focus: [
    { file: 'src/config.ts', line: 12, reason: 'Secret key set in plaintext at the flagged line' },
    { file: 'src/middleware/ratelimit.ts', line: 1, reason: 'The new token-bucket logic everything else depends on' },
    { file: 'src/api/public/webhooks.ts', line: 22, reason: 'Where the limiter is mounted on the public router' },
  ],
};

/** Metadata of the (illustrative, not derived from a real call) stored generation. */
export const SEED_BRIEF_META = {
  provider: 'openai',
  model: 'gpt-4.1',
  tokensIn: 8200,
  tokensOut: 1300,
  costUsd: 0.014,
} as const;
