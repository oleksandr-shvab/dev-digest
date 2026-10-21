import type { CallToolResult } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { DevDigestApiError } from '../api/client.js';
import type { DevDigestApi } from '../api/client.js';
import { ToolInputError } from '../api/resolve.js';
import type { PullRequestResolver } from '../api/resolve.js';
import type { Clock } from '../clock.js';
import type { Logger } from '../log.js';

export interface ToolDeps {
  api: DevDigestApi;
  pulls: PullRequestResolver;
  logger: Logger;
  apiBaseUrl: string;
  clock: Clock;
  runWaitMs: number;
}

// ---- Input fields shared by several tools ----

export const repositoryField = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/, 'Use owner/name, e.g. acme/payments-api')
  .describe('GitHub repository as owner/name, e.g. acme/payments-api');

export const pullRequestNumberField = z
  .int()
  .min(1)
  .max(10_000_000)
  .describe('Pull request number as shown on GitHub, e.g. 482');

export const responseFormatSchema = z.enum(['concise', 'detailed']);
export type ResponseFormat = z.infer<typeof responseFormatSchema>;

/** `response_format` with a per-tool description of what `detailed` adds. */
export function responseFormatField(describeDetailed: string) {
  return responseFormatSchema.default('concise').describe(describeDetailed);
}

// ---- Size budget (BP-08) ----

/** Upper bound for one tool's serialized structured result; measured against it in round 2. */
export const MAX_STRUCTURED_CHARS = 12_000;
/** Budget for the item list of a paged result, leaving room for the envelope around it. */
export const ITEMS_BUDGET_CHARS = 10_000;
export const RUN_TOP_FINDINGS = { maxItems: 5, maxChars: 2_000 } as const;
export const TEXT_CAPS = {
  title: 200,
  summaryConcise: 500,
  summaryDetailed: 1500,
  rationale: 600,
  suggestion: 400,
  rule: 300,
  snippet: 200,
  agentDescriptionConcise: 200,
  agentDescriptionDetailed: 1000,
  errorText: 300,
} as const;

const TRUNCATION_SUFFIX = ' …[truncated]';
// Terminal escape sequences: OSC (ESC ] … BEL|ST), CSI (ESC [ … final byte), and any other two-byte ESC sequence.
const ANSI_PATTERN = /\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)|\u001b\[[0-9;?]*[ -/]*[@-~]|\u001b[@-Z\\-_]/g;
// C0 and C1 control characters except \t (0x09) and \n (0x0a).
const CONTROL_PATTERN = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g;

/**
 * Cleans LLM-written or API-provided text before it reaches the agent (BP-14): strips terminal
 * escapes and control characters, trims, and cuts to `maxChars` (suffix included).
 */
export function sanitizeText(value: string | null | undefined, maxChars: number): string | null {
  if (value === null || value === undefined) return null;
  const clean = value.replace(ANSI_PATTERN, '').replace(CONTROL_PATTERN, '').trim();
  if (clean.length <= maxChars) return clean;

  let cut = clean.slice(0, Math.max(0, maxChars - TRUNCATION_SUFFIX.length));
  const last = cut.charCodeAt(cut.length - 1);
  // Do not leave half of a surrogate pair at the cut.
  if (last >= 0xd800 && last <= 0xdbff) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}${TRUNCATION_SUFFIX}`;
}

// ---- Results ----

export function toolResult<T extends Record<string, unknown>>(structured: T): CallToolResult {
  return { structuredContent: structured, content: [{ type: 'text', text: JSON.stringify(structured) }] };
}

export function toolError(message: string): CallToolResult {
  return { isError: true, content: [{ type: 'text', text: message }] };
}

// ---- Error mapping ----

function endWithPeriod(text: string): string {
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

export function describeApiError(err: DevDigestApiError, apiBaseUrl: string): string {
  if (err.status === 0) {
    if (err.code === 'timeout') {
      return `${endWithPeriod(err.message)} Retry once; if it keeps failing, check the API terminal.`;
    }
    return `The DevDigest API is not reachable at ${apiBaseUrl}. Ask the user to start it with ./scripts/dev.sh from the repo root, then retry.`;
  }
  const serverMessage = endWithPeriod(sanitizeText(err.message, TEXT_CAPS.errorText) ?? '');
  if (err.status === 404) return `${serverMessage} Check repository and pull_request_number.`;
  if (err.status === 429) {
    return 'DevDigest rate limit reached (review starts are limited to 10 per minute). Wait a minute, then retry.';
  }
  if (err.status >= 500) {
    return `The DevDigest API failed (${err.status}): ${serverMessage} Check the API terminal for details.`;
  }
  return serverMessage;
}

function textLength(result: CallToolResult): number {
  return result.content.reduce((sum, block) => sum + (block.type === 'text' ? block.text.length : 0), 0);
}

/**
 * Wraps every tool handler so it never throws into the SDK (which would forward the raw exception
 * text to the agent). Known errors become actionable `isError` results; anything else is logged
 * with its stack on stderr and answered with a generic message (BP-10, BP-14).
 */
export async function runTool(
  name: string,
  deps: Pick<ToolDeps, 'logger' | 'apiBaseUrl' | 'clock'>,
  handler: () => Promise<CallToolResult>,
): Promise<CallToolResult> {
  const startedAt = deps.clock.now();
  let result: CallToolResult;
  try {
    result = await handler();
  } catch (err) {
    if (err instanceof ToolInputError) {
      result = toolError(err.message);
    } else if (err instanceof DevDigestApiError) {
      result = toolError(describeApiError(err, deps.apiBaseUrl));
    } else {
      deps.logger.error('unexpected tool error', {
        tool: name,
        stack: err instanceof Error ? err.stack : String(err),
      });
      const message = sanitizeText(err instanceof Error ? err.message : String(err), 200) ?? '';
      result = toolError(
        `Unexpected error in the DevDigest MCP server: ${message}. Details are in the server log (stderr).`,
      );
    }
  }
  deps.logger.info('tool call', {
    tool: name,
    ms: deps.clock.now() - startedAt,
    is_error: result.isError === true,
    chars: textLength(result),
  });
  return result;
}
