import * as z from 'zod/v4';

export interface McpConfig {
  apiBaseUrl: string;
  requestTimeoutMs: number;
  runWaitMs: number;
  logLevel: 'silent' | 'error' | 'info' | 'debug';
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const API_URL_MESSAGE =
  'DEVDIGEST_API_URL must point at the local DevDigest API, e.g. http://localhost:3001';

/** An empty string counts as unset (same pattern as `PROMPT_LOG_DETAIL` in server/src/platform/config.ts). */
const emptyAsUnset = (value: unknown): unknown => (value === '' ? undefined : value);

function parseLoopbackOrigin(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const isLocalApi =
    url.protocol === 'http:' &&
    LOOPBACK_HOSTS.has(url.hostname) &&
    url.username === '' &&
    url.password === '' &&
    url.pathname === '/' &&
    url.search === '' &&
    url.hash === '';
  // `origin` drops the trailing slash.
  return isLocalApi ? url.origin : null;
}

function rangedInt(name: string, min: number, max: number, fallback: number) {
  const message = `${name} must be between ${min} and ${max} (milliseconds); default ${fallback}`;
  return z.preprocess(
    emptyAsUnset,
    z.coerce
      .number({ error: message })
      .int({ error: message })
      .min(min, { error: message })
      .max(max, { error: message })
      .default(fallback),
  );
}

const McpEnvSchema = z.object({
  DEVDIGEST_API_URL: z.preprocess(
    emptyAsUnset,
    z
      .string()
      .default('http://localhost:3001')
      .refine((value) => parseLoopbackOrigin(value) !== null, { error: API_URL_MESSAGE })
      .transform((value) => parseLoopbackOrigin(value) as string),
  ),
  DEVDIGEST_MCP_TIMEOUT_MS: rangedInt('DEVDIGEST_MCP_TIMEOUT_MS', 1_000, 60_000, 10_000),
  DEVDIGEST_RUN_WAIT_MS: rangedInt('DEVDIGEST_RUN_WAIT_MS', 5_000, 600_000, 120_000),
  DEVDIGEST_MCP_LOG: z.preprocess(
    emptyAsUnset,
    z
      .enum(['silent', 'error', 'info', 'debug'], {
        error: 'DEVDIGEST_MCP_LOG must be one of silent, error, info, debug; default info',
      })
      .default('info'),
  ),
});

export function loadMcpConfig(env: NodeJS.ProcessEnv = process.env): McpConfig {
  const parsed = McpEnvSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(
      `Invalid DevDigest MCP server configuration: ${parsed.error.issues.map((issue) => issue.message).join('; ')}`,
    );
  }
  return {
    apiBaseUrl: parsed.data.DEVDIGEST_API_URL,
    requestTimeoutMs: parsed.data.DEVDIGEST_MCP_TIMEOUT_MS,
    runWaitMs: parsed.data.DEVDIGEST_RUN_WAIT_MS,
    logLevel: parsed.data.DEVDIGEST_MCP_LOG,
  };
}
