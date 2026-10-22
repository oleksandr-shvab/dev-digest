import type { BlastDegradedReason, BlastRadius } from '@devdigest/shared';
import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { resolveRepository } from '../api/resolve.js';
import { takePage } from './paging.js';
import {
  MAX_STRUCTURED_CHARS,
  pullRequestNumberField,
  repositoryField,
  runTool,
  sanitizeText,
  TEXT_CAPS,
  toolResult,
} from './shared.js';
import type { ToolDeps } from './shared.js';

export const GET_BLAST_RADIUS_TOOL = 'devdigest_get_blast_radius';

// Kept in step with `BlastDegradedReason` in the vendored contract: `satisfies` fails the typecheck on a typo.
export const BLAST_DEGRADED_REASONS = [
  'flag_off',
  'index_failed',
  'index_partial',
  'repo_too_large',
  'no_data',
] as const satisfies readonly BlastDegradedReason[];

/** Room kept free for `message` when the size cap cuts the result. */
const MESSAGE_RESERVE_CHARS = 600;

const inputSchema = z.object({
  repository: repositoryField,
  pull_request_number: pullRequestNumberField,
});

const outputSchema = z.object({
  repository: z.string(),
  pull_request_number: z.int(),
  changed_symbols: z.array(z.object({ name: z.string(), file: z.string(), kind: z.string() })),
  downstream: z.array(
    z.object({
      symbol: z.string(),
      callers: z.array(z.object({ name: z.string(), file: z.string(), line: z.int() })),
      endpoints_affected: z.array(z.string()),
      crons_affected: z.array(z.string()),
    }),
  ),
  summary: z.string(),
  degraded: z.boolean().optional(),
  reason: z.enum(BLAST_DEGRADED_REASONS).optional(),
  message: z.string().nullable(),
});

type Output = z.infer<typeof outputSchema>;
type Body = Omit<Output, 'message'>;

const REFRESH_HINT =
  'ask the user to refresh the repository from its Pull requests page in DevDigest, then call again.';

const DEGRADED_MESSAGE: Record<BlastDegradedReason, (repo: string) => string> = {
  flag_off: () =>
    'Repository intelligence is off in DevDigest (REPO_INTEL_ENABLED), so callers come from a text search and endpoints are not attributed; treat this map as incomplete.',
  index_failed: (repo) =>
    `The last index of ${repo} failed, so this map may be incomplete; ${REFRESH_HINT}`,
  index_partial: (repo) =>
    `The index of ${repo} is incomplete, so some callers may be missing; ${REFRESH_HINT}`,
  repo_too_large: (repo) =>
    `${repo} is too large to index fully, so this map may be incomplete; treat a missing caller as unknown, not as absent.`,
  no_data: (repo) =>
    `This map was not read from the index of ${repo} (no usable index, or no changed files on record), so any callers come from a text search and endpoints are not attributed; ${REFRESH_HINT}`,
};

interface SizeCut {
  keptSymbols: number;
  totalSymbols: number;
  keptGroups: number;
  totalGroups: number;
}

export function registerGetBlastRadius(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    GET_BLAST_RADIUS_TOOL,
    {
      title: 'Blast radius of a pull request',
      description: `Show what else in the repository a pull request's changes can affect: the changed symbols, who calls them (file:line) and the HTTP endpoints and crons that depend on them. Read-only, no model call. Call it before or while reviewing a PR. If the index is incomplete the result says so.`,
      inputSchema,
      outputSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ repository, pull_request_number }) =>
      runTool(GET_BLAST_RADIUS_TOOL, deps, async () => {
        // Unknown repository or PR: a ToolInputError from the resolvers. Reads only, so no review is started.
        const repo = await resolveRepository(deps.api, repository);
        const pr = await deps.pulls.resolve(repo, pull_request_number);
        const blast = await deps.api.getBlastRadius(pr.id);

        const body = toBody(repo.full_name, pull_request_number, blast);
        const { body: sized, cut } = applySizeCap(body);
        const output: Output = { ...sized, message: buildMessage(repo.full_name, body, cut) };
        return toolResult(output);
      }),
  );
}

function clean(value: string): string {
  return sanitizeText(value, TEXT_CAPS.title) ?? '';
}

function toBody(fullName: string, pullRequestNumber: number, blast: BlastRadius): Body {
  return {
    repository: fullName,
    pull_request_number: pullRequestNumber,
    changed_symbols: blast.changed_symbols.map((s) => ({ name: clean(s.name), file: clean(s.file), kind: s.kind })),
    downstream: blast.downstream.map((d) => ({
      symbol: clean(d.symbol),
      callers: d.callers.map((c) => ({ name: clean(c.name), file: clean(c.file), line: c.line })),
      endpoints_affected: d.endpoints_affected.map(clean),
      crons_affected: d.crons_affected.map(clean),
    })),
    summary: blast.summary,
    ...(blast.degraded !== undefined ? { degraded: blast.degraded } : {}),
    ...(blast.reason !== undefined ? { reason: blast.reason } : {}),
  };
}

/** BP-08: keep the serialized result within `MAX_STRUCTURED_CHARS`; lowest-ranked data goes first. */
function applySizeCap(body: Body): { body: Body; cut: SizeCut | null } {
  if (JSON.stringify(body).length <= MAX_STRUCTURED_CHARS) return { body, cut: null };

  // 1. Drop downstream groups from the end (lowest rank) while the groups alone leave no room for symbols.
  let downstream = body.downstream;
  const withoutSymbols = (groups: Body['downstream']): number =>
    JSON.stringify({ ...body, changed_symbols: [], downstream: groups }).length;
  while (downstream.length > 1 && withoutSymbols(downstream) + MESSAGE_RESERVE_CHARS > MAX_STRUCTURED_CHARS) {
    downstream = downstream.slice(0, -1);
  }

  // 2. Cut changed_symbols to what fits. The tool has no cursor input, so `nextCursor` is ignored
  // and the cut is reported in `message` instead.
  const envelopeChars = withoutSymbols(downstream);
  const { page } = takePage(body.changed_symbols, {
    offset: 0,
    limit: body.changed_symbols.length,
    maxChars: MAX_STRUCTURED_CHARS - envelopeChars - MESSAGE_RESERVE_CHARS,
    key: 'blast',
  });

  return {
    body: { ...body, changed_symbols: page, downstream },
    cut: {
      keptSymbols: page.length,
      totalSymbols: body.changed_symbols.length,
      keptGroups: downstream.length,
      totalGroups: body.downstream.length,
    },
  };
}

function buildMessage(fullName: string, body: Body, cut: SizeCut | null): string | null {
  let message: string | null = null;
  if (body.degraded === true) {
    message =
      body.reason !== undefined
        ? DEGRADED_MESSAGE[body.reason](fullName)
        : `This map may be incomplete; ${REFRESH_HINT}`;
  } else if (body.changed_symbols.length === 0) {
    message =
      'The changed files of this pull request declare no indexed symbols (for example only docs or config changed), so there is nothing downstream to check.';
  } else if (body.downstream.length === 0) {
    message = `No code in ${fullName} calls the ${body.changed_symbols.length} changed symbol(s) of this pull request, so there are no downstream callers to check.`;
  }

  if (cut === null) return message;
  const note = `Response size limit reached: showing ${cut.keptSymbols} of ${cut.totalSymbols} changed symbols and ${cut.keptGroups} of ${cut.totalGroups} downstream groups (highest rank first).`;
  return message === null ? note : `${message} ${note}`;
}
