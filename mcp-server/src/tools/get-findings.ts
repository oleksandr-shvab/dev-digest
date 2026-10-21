import type { ReviewRecord, RunSummary } from '@devdigest/shared';
import type { CallToolResult, McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { resolveRepository, ToolInputError } from '../api/resolve.js';
import { severitySchema, SEVERITY_RANK, sortFindings, toFindingItem } from './findings-view.js';
import { decodeCursor, takePage } from './paging.js';
import {
  ITEMS_BUDGET_CHARS,
  MAX_STRUCTURED_CHARS,
  pullRequestNumberField,
  repositoryField,
  responseFormatField,
  runTool,
  sanitizeText,
  TEXT_CAPS,
  toolResult,
} from './shared.js';
import type { ToolDeps } from './shared.js';

export const GET_FINDINGS_TOOL = 'devdigest_get_findings';

const inputSchema = z.object({
  repository: repositoryField,
  pull_request_number: pullRequestNumberField,
  agent_name: z.string().trim().min(1).max(200).optional().describe('Only runs of this reviewer'),
  run_id: z
    .uuid()
    .optional()
    .describe('A run_id from devdigest_run_agent_on_pull_request; omit for the latest completed run'),
  min_severity: severitySchema.default('SUGGESTION').describe('Lowest severity to include'),
  include_dismissed: z.boolean().default(false).describe('Also return findings the user dismissed'),
  limit: z.int().min(1).max(50).default(20),
  cursor: z.string().max(300).optional().describe('next_cursor from the previous call'),
  response_format: responseFormatField('detailed adds rationale, suggestion and run cost'),
});
type Input = z.infer<typeof inputSchema>;

/** Room kept for `next_cursor` and the paging `message`, which are only known after the page is cut. */
const PAGING_RESERVE_CHARS = 500;

const RUN_STATUSES = ['running', 'done', 'failed', 'cancelled'] as const;
type KnownRunStatus = (typeof RUN_STATUSES)[number];

const outputSchema = z.object({
  repository: z.string(),
  pull_request_number: z.int(),
  pull_request_title: z.string(),
  run: z.object({
    run_id: z.string(),
    agent_name: z.string().nullable(),
    status: z.enum([...RUN_STATUSES, 'unknown']),
    ran_at: z.string().nullable(),
    verdict: z.string().nullable(),
    score: z.int().nullable(),
    summary: z.string().nullable(),
    error: z.string().nullable(),
    provider: z.string().nullable().optional(),
    model: z.string().nullable().optional(),
    duration_ms: z.int().nullable().optional(),
    tokens_in: z.int().nullable().optional(),
    tokens_out: z.int().nullable().optional(),
    cost_usd: z.number().nullable().optional(),
    grounding: z.string().nullable().optional(),
  }),
  findings: z.array(
    z.object({
      severity: severitySchema,
      category: z.string(),
      title: z.string(),
      file: z.string(),
      start_line: z.int(),
      end_line: z.int(),
      confidence: z.number(),
      triage: z.enum(['open', 'accepted', 'dismissed']),
      kind: z.string().optional(),
      rationale: z.string().optional(),
      suggestion: z.string().optional(),
    }),
  ),
  total_matching: z.int(),
  returned: z.int(),
  next_cursor: z.string().nullable(),
  message: z.string().nullable(),
});
type Output = z.infer<typeof outputSchema>;

export function registerGetFindings(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    GET_FINDINGS_TOOL,
    {
      title: 'Read DevDigest review findings',
      description: `Read the result of a DevDigest review run on a pull request: verdict, score, and findings with file and line, most severe first. Defaults to the latest completed run; choose one with agent_name or run_id, narrow with min_severity, page with cursor.`,
      inputSchema,
      outputSchema,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) => runTool(GET_FINDINGS_TOOL, deps, () => getFindings(args, deps)),
  );
}

async function getFindings(args: Input, deps: ToolDeps): Promise<CallToolResult> {
  const repo = await resolveRepository(deps.api, args.repository);
  const pr = await deps.pulls.resolve(repo, args.pull_request_number);
  const prRef = `${repo.full_name}#${pr.number}`;

  const run = pickRun(await deps.api.listRuns(pr.id), args, prRef);
  const status = RUN_STATUSES.find((s) => s === run.status) ?? 'unknown';
  const detailed = args.response_format === 'detailed';

  const envelope = {
    repository: repo.full_name,
    pull_request_number: pr.number,
    pull_request_title: sanitizeText(pr.title, TEXT_CAPS.title) ?? '',
  };
  const runBlock = (review: ReviewRecord | undefined): Output['run'] => ({
    run_id: run.run_id,
    agent_name: sanitizeText(run.agent_name ?? review?.agent_name, TEXT_CAPS.title),
    status,
    ran_at: run.ran_at,
    verdict: review?.verdict ?? null,
    score: review?.score ?? run.score,
    summary: sanitizeText(review?.summary, detailed ? TEXT_CAPS.summaryDetailed : TEXT_CAPS.summaryConcise),
    error: sanitizeText(run.error, TEXT_CAPS.errorText),
    ...(detailed
      ? {
          provider: run.provider,
          model: run.model,
          duration_ms: run.duration_ms,
          tokens_in: run.tokens_in,
          tokens_out: run.tokens_out,
          cost_usd: run.cost_usd,
          grounding: run.grounding,
        }
      : {}),
  });
  const noFindings = (review: ReviewRecord | undefined, message: string): CallToolResult =>
    toolResult<Output>({
      ...envelope,
      run: runBlock(review),
      findings: [],
      total_matching: 0,
      returned: 0,
      next_cursor: null,
      message,
    });

  if (status !== 'done') return noFindings(undefined, notDoneMessage(run, status));

  const review = (await deps.api.listReviews(pr.id)).find(
    (r) => r.run_id === run.run_id && r.kind === 'review',
  );
  if (!review) return noFindings(undefined, 'This run finished but stored no review.');

  const matching = sortFindings(
    review.findings.filter(
      (finding) =>
        (SEVERITY_RANK[finding.severity] ?? 0) >= SEVERITY_RANK[args.min_severity] &&
        (args.include_dismissed || !finding.dismissed_at),
    ),
  );
  if (matching.length === 0) {
    return noFindings(review, emptyMessage(review.findings.length));
  }

  const key = `f|${run.run_id}|${args.min_severity}|${args.include_dismissed}`;
  const offset = args.cursor ? decodeCursor(args.cursor, key) : 0;
  const items = matching.map((finding) => toFindingItem(finding, args.response_format));
  const runView = runBlock(review);
  // The run block grows in `detailed` mode (summary up to 1,500 chars), so the room left for items
  // is what remains of MAX_STRUCTURED_CHARS, not a fixed share: otherwise the whole result can pass the cap.
  const envelopeChars = JSON.stringify({
    ...envelope,
    run: runView,
    findings: [],
    total_matching: matching.length,
    returned: 0,
    next_cursor: null,
    message: null,
  }).length;
  const { page, nextCursor, stoppedByBudget } = takePage(items, {
    offset,
    limit: args.limit,
    maxChars: Math.min(ITEMS_BUDGET_CHARS, MAX_STRUCTURED_CHARS - envelopeChars - PAGING_RESERVE_CHARS),
    key,
  });

  let message: string | null = null;
  if (nextCursor !== null) {
    message = `Showing ${page.length} of ${matching.length} findings, most severe first. Pass cursor "${nextCursor}" for the next page, or narrow with min_severity: "WARNING".`;
    if (stoppedByBudget) {
      message += ' Response size limit reached; use response_format "concise" or a smaller limit.';
    }
  }

  return toolResult<Output>({
    ...envelope,
    run: runView,
    findings: page,
    total_matching: matching.length,
    returned: page.length,
    next_cursor: nextCursor,
    message,
  });
}

/** Chooses the run to read. Throws a `ToolInputError` (an `isError` result) when there is none. */
function pickRun(runs: readonly RunSummary[], args: Input, prRef: string): RunSummary {
  if (args.run_id) {
    const found = runs.find((run) => run.run_id === args.run_id);
    if (found) return found;
    throw new ToolInputError(
      `Run ${args.run_id} is not a run of ${prRef}. Omit run_id to read the latest completed run.`,
    );
  }

  const wanted = args.agent_name?.toLowerCase();
  const candidates = wanted ? runs.filter((run) => run.agent_name?.toLowerCase() === wanted) : runs;
  // The API lists runs newest first, so the first completed one is the latest.
  const latest = candidates.find((run) => run.status === 'done');
  if (latest) return latest;

  const agentLabel = args.agent_name ? ` by ${sanitizeText(args.agent_name, TEXT_CAPS.title)}` : '';
  const stillRunning = candidates.filter((run) => run.status === 'running').length;
  let message = `No completed review of ${prRef}${agentLabel} yet.`;
  if (stillRunning > 0) {
    message += ` ${stillRunning} run(s) still running — call again in about a minute.`;
  }
  if (args.agent_name && candidates.length === 0 && runs.length > 0) {
    const names = [...new Set(runs.map((run) => sanitizeText(run.agent_name, TEXT_CAPS.title)).filter(Boolean))];
    if (names.length > 0) message += ` Reviewers with runs on this pull request: ${names.slice(0, 10).join(', ')}.`;
  }
  message += ' Start one with devdigest_run_agent_on_pull_request.';
  throw new ToolInputError(message);
}

function notDoneMessage(run: RunSummary, status: Exclude<KnownRunStatus, 'done'> | 'unknown'): string {
  switch (status) {
    case 'running':
      return `Review still running${run.ran_at ? ` (started ${run.ran_at})` : ''}. Call devdigest_get_findings again in about a minute with the same run_id.`;
    case 'failed': {
      const error = sanitizeText(run.error, TEXT_CAPS.errorText)?.replace(/\.+$/, '');
      return `Run failed: ${error || 'no error text was recorded'}. Start a new run with devdigest_run_agent_on_pull_request once the cause is fixed.`;
    }
    case 'cancelled':
      return 'Run was cancelled; no findings were stored.';
    case 'unknown':
      return 'This run has a status DevDigest MCP does not recognise; no findings are available for it.';
  }
}

function emptyMessage(storedFindings: number): string {
  if (storedFindings === 0) return 'This review reported no findings.';
  return `No findings match the filters; ${storedFindings} stored finding(s) are hidden by min_severity or dismissal — lower min_severity or pass include_dismissed: true.`;
}
