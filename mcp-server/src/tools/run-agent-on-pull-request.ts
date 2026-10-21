import type { Agent, ReviewRecord, RunSummary } from '@devdigest/shared';
import type { CallToolResult, McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { DevDigestApiError } from '../api/client.js';
import { resolveRepository, ToolInputError } from '../api/resolve.js';
import { countBySeverity, severitySchema, sortFindings, toFindingItem } from './findings-view.js';
import { takePage } from './paging.js';
import {
  describeApiError,
  pullRequestNumberField,
  repositoryField,
  RUN_TOP_FINDINGS,
  runTool,
  sanitizeText,
  TEXT_CAPS,
  toolError,
  toolResult,
} from './shared.js';
import type { ToolDeps } from './shared.js';
import { waitForRun } from './wait-for-run.js';

export const RUN_AGENT_TOOL = 'devdigest_run_agent_on_pull_request';

const inputSchema = z.object({
  repository: repositoryField,
  pull_request_number: pullRequestNumberField,
  agent_name: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .describe('Reviewer name from devdigest_list_agents, e.g. Security Reviewer'),
});
type Input = z.infer<typeof inputSchema>;

const outputSchema = z.object({
  run_id: z.string(),
  agent_name: z.string(),
  repository: z.string(),
  pull_request_number: z.int(),
  pull_request_title: z.string(),
  status: z.enum(['done', 'running']),
  started_new_run: z.boolean(),
  elapsed_seconds: z.int(),
  verdict: z.string().nullable(),
  score: z.int().nullable(),
  summary: z.string().nullable(),
  finding_counts: z.object({ CRITICAL: z.int(), WARNING: z.int(), SUGGESTION: z.int() }).nullable(),
  findings_total: z.int().nullable(),
  top_findings: z.array(
    z.object({
      severity: severitySchema,
      category: z.string(),
      title: z.string(),
      file: z.string(),
      start_line: z.int(),
      end_line: z.int(),
    }),
  ),
  next_step: z.string(),
});
type Output = z.infer<typeof outputSchema>;

/** Titles of the findings shown inline are shorter than in `devdigest_get_findings`: the full list is one call away. */
const TOP_FINDING_TITLE_CHARS = 160;
const SUMMARY_CHARS = 300;
const KNOWN_AGENTS_LIMIT = 10;

export function registerRunAgentOnPullRequest(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    RUN_AGENT_TOOL,
    {
      title: 'Run a DevDigest review',
      description: `Run one DevDigest reviewer on a pull request and wait up to 2 minutes for the result: verdict, counts by severity and the top findings. Spends LLM tokens — call it only when the user explicitly asks for a review. If the result has status "running", the review is still going on the server and was not cancelled: do NOT call this tool again for the same pull request and reviewer (that pays for a second review); call devdigest_get_findings with the returned run_id a minute later.`,
      inputSchema,
      outputSchema,
      // Not read-only: it starts a paid review. Not destructive, and every call can start a new run.
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (args, ctx) => runTool(RUN_AGENT_TOOL, deps, () => runAgent(args, deps, ctx.mcpReq.signal)),
  );
}

async function runAgent(args: Input, deps: ToolDeps, signal: AbortSignal): Promise<CallToolResult> {
  const startedAt = deps.clock.now();
  const deadline = startedAt + deps.runWaitMs;

  // Everything that can fail on the agent's input happens before the only POST.
  const repo = await resolveRepository(deps.api, args.repository);
  const pr = await deps.pulls.resolve(repo, args.pull_request_number);
  const agent = findAgent(await deps.api.listAgents(), args.agent_name);

  // The API starts a second run for the same agent on the same PR without objection
  // (server/src/modules/reviews/service.ts:143-161), which would pay twice: wait on the running one instead.
  const running = (await deps.api.listRuns(pr.id)).find(
    (run) => run.agent_id === agent.id && run.status === 'running',
  );
  let runId: string;
  let startedNewRun: boolean;
  if (running) {
    runId = running.run_id;
    startedNewRun = false;
  } else {
    // A cancelled call must not start a paid review.
    if (signal.aborted) return toolError('The call was cancelled before a review was started.');
    const started = await deps.api.startReview(pr.id, agent.id); // the only POST in this package
    const target = started.runs[0];
    if (!target) return toolError('DevDigest accepted the request but returned no run.');
    runId = target.run_id;
    startedNewRun = true;
  }

  const outcome = await waitForRun({
    api: deps.api,
    pullRequestId: pr.id,
    runId,
    deadline,
    clock: deps.clock,
    signal,
  });

  const base = {
    run_id: runId,
    agent_name: sanitizeText(agent.name, TEXT_CAPS.title) ?? '',
    repository: repo.full_name,
    pull_request_number: pr.number,
    pull_request_title: sanitizeText(pr.title, TEXT_CAPS.title) ?? '',
    started_new_run: startedNewRun,
    elapsed_seconds: Math.round((deps.clock.now() - startedAt) / 1000),
  };

  switch (outcome.kind) {
    case 'terminal':
      switch (outcome.status) {
        case 'done':
          return doneResult(deps, pr.id, base, outcome.run);
        case 'failed': {
          const error = sanitizeText(outcome.run.error, TEXT_CAPS.errorText)?.replace(/\.+$/, '');
          return toolError(
            `The review failed (run ${runId}): ${error || 'no error text was recorded'}. Fix the cause (for example a missing provider API key in DevDigest Settings) and ask the user before starting it again.`,
          );
        }
        case 'cancelled':
          return toolError(
            `The review was cancelled in DevDigest (run ${runId}). Ask the user before starting it again.`,
          );
      }
      break;
    case 'deadline':
    case 'aborted':
      // Reaching the limit is not an error and never cancels the run: it keeps going on the API.
      return toolResult<Output>({
        ...base,
        status: 'running',
        verdict: null,
        score: null,
        summary: null,
        finding_counts: null,
        findings_total: null,
        top_findings: [],
        next_step: runningNextStep(runId),
      });
    case 'missing':
      return toolError(
        `Run ${runId} no longer exists in DevDigest (it was deleted). Ask the user before starting a new review.`,
      );
    case 'api_error':
      return toolError(
        `${describeApiError(outcome.error, deps.apiBaseUrl)} The review may still be running; check it later with devdigest_get_findings and run_id ${runId}.`,
      );
  }
}

function findAgent(agents: readonly Agent[], requested: string): Agent {
  const wanted = requested.trim().toLowerCase();
  const matches = agents.filter((agent) => agent.name.trim().toLowerCase() === wanted);
  const label = sanitizeText(requested, TEXT_CAPS.title) ?? '';
  if (matches.length > 1) {
    throw new ToolInputError(
      `${matches.length} reviewers are named '${label}'. Rename one on DevDigest's Agents page, then retry.`,
    );
  }
  const [match] = matches;
  if (match) return match;

  const names = agents
    .slice(0, KNOWN_AGENTS_LIMIT)
    .map((agent) => sanitizeText(agent.name, TEXT_CAPS.title))
    .filter((name): name is string => name !== null && name !== '');
  throw new ToolInputError(
    `No reviewer named '${label}'. Available: ${names.length > 0 ? names.join(', ') : 'none'}. Use a name from devdigest_list_agents.`,
  );
}

type ResultBase = Omit<
  Output,
  'status' | 'verdict' | 'score' | 'summary' | 'finding_counts' | 'findings_total' | 'top_findings' | 'next_step'
>;

/** The run is done: the review row holds the verdict and findings. */
async function doneResult(deps: ToolDeps, pullRequestId: string, base: ResultBase, run: RunSummary): Promise<CallToolResult> {
  let reviews: ReviewRecord[];
  try {
    reviews = await deps.api.listReviews(pullRequestId);
  } catch (err) {
    if (!(err instanceof DevDigestApiError)) throw err;
    return toolError(
      `${describeApiError(err, deps.apiBaseUrl)} The review finished; read it with devdigest_get_findings and run_id ${base.run_id}.`,
    );
  }

  const review = reviews.find((r) => r.run_id === base.run_id && r.kind === 'review');
  if (!review) {
    // Nothing carries the findings of this run: point at the read tool instead of inventing counts.
    return toolResult<Output>({
      ...base,
      status: 'done',
      verdict: null,
      score: run.score,
      summary: null,
      finding_counts: null,
      findings_total: null,
      top_findings: [],
      next_step: `The run finished but no review was stored for it. Call devdigest_get_findings with run_id ${base.run_id} to check.`,
    });
  }

  // Dismissed findings are neither counted nor listed, as in countBySeverity.
  const open = sortFindings(review.findings.filter((finding) => !finding.dismissed_at));
  const counts = countBySeverity(review.findings);
  const total = counts.CRITICAL + counts.WARNING + counts.SUGGESTION;
  const { page } = takePage(
    open.map((finding) => ({
      severity: finding.severity,
      category: finding.category,
      title: sanitizeText(finding.title, TOP_FINDING_TITLE_CHARS) ?? '',
      file: toFindingItem(finding, 'concise').file,
      start_line: finding.start_line,
      end_line: finding.end_line,
    })),
    { offset: 0, limit: RUN_TOP_FINDINGS.maxItems, maxChars: RUN_TOP_FINDINGS.maxChars, key: 'run-top' },
  );

  return toolResult<Output>({
    ...base,
    status: 'done',
    verdict: review.verdict,
    score: review.score ?? run.score,
    summary: sanitizeText(review.summary, SUMMARY_CHARS),
    finding_counts: counts,
    findings_total: total,
    top_findings: page,
    next_step: doneNextStep(base.run_id, page.length, total),
  });
}

function doneNextStep(runId: string, shown: number, total: number): string {
  if (total === 0) return 'The review reported no findings.';
  if (shown < total) {
    return `Showing the top ${shown} of ${total} findings. For the full list with filters call devdigest_get_findings with run_id ${runId} (e.g. min_severity: "WARNING").`;
  }
  return `All ${total} findings are listed. For rationale and suggestions call devdigest_get_findings with run_id ${runId} and response_format "detailed".`;
}

function runningNextStep(runId: string): string {
  return `The review is still running on the DevDigest server and has NOT been cancelled. Do not call devdigest_run_agent_on_pull_request again for this pull request and reviewer — that would start and pay for a second review. Call devdigest_get_findings with run_id ${runId} in about a minute.`;
}
