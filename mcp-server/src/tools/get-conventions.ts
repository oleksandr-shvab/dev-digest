import type { ConventionCandidate, ConventionCategory } from '@devdigest/shared';
import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { resolveRepository } from '../api/resolve.js';
import { decodeCursor, takePage } from './paging.js';
import {
  ITEMS_BUDGET_CHARS,
  repositoryField,
  responseFormatField,
  runTool,
  sanitizeText,
  TEXT_CAPS,
  toolResult,
} from './shared.js';
import type { ToolDeps } from './shared.js';

export const GET_CONVENTIONS_TOOL = 'devdigest_get_conventions';

// Kept in step with `ConventionCategory` in the vendored contract: `satisfies` fails the typecheck on a typo.
export const CONVENTION_CATEGORIES = [
  'naming',
  'structure',
  'imports',
  'typing',
  'error-handling',
  'testing',
  'formatting',
  'other',
] as const satisfies readonly ConventionCategory[];

const inputSchema = z.object({
  repository: repositoryField,
  status: z
    .enum(['accepted', 'pending', 'all'])
    .default('accepted')
    .describe('pending = candidates nobody has confirmed yet'),
  category: z.enum(CONVENTION_CATEGORIES).optional(),
  limit: z.int().min(1).max(100).default(30),
  cursor: z.string().max(300).optional().describe('next_cursor from the previous call'),
  response_format: responseFormatField('detailed adds the evidence location and snippet'),
});

const outputSchema = z.object({
  repository: z.string(),
  conventions: z.array(
    z.object({
      category: z.string(),
      rule: z.string(),
      confidence: z.number(),
      status: z.enum(['accepted', 'pending']),
      evidence: z.string().optional(),
      evidence_snippet: z.string().optional(),
      edited: z.boolean().optional(),
    }),
  ),
  counts: z.object({ accepted: z.int(), pending: z.int() }),
  total_matching: z.int(),
  returned: z.int(),
  next_cursor: z.string().nullable(),
  message: z.string().nullable(),
});

type Status = 'accepted' | 'pending';

export function registerGetConventions(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    GET_CONVENTIONS_TOOL,
    {
      title: 'Read repository conventions',
      description: `Read the coding conventions DevDigest extracted for a repository — accepted ones by default, pending candidates on request — each with category, rule and confidence.`,
      inputSchema,
      outputSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ repository, status, category, limit, cursor, response_format }) =>
      runTool(GET_CONVENTIONS_TOOL, deps, async () => {
        // Repo lookup only: no pull-request resolution, so no GitHub sync. Never the scan endpoint (LLM cost).
        const repo = await resolveRepository(deps.api, repository);
        // The API already drops rejected rows; filter again so a rejected row can never leak through.
        const all = (await deps.api.listConventions(repo.id)).filter(isListed);
        const counts = {
          accepted: all.filter((c) => c.status === 'accepted').length,
          pending: all.filter((c) => c.status === 'pending').length,
        };

        const matching = all
          .filter((c) => status === 'all' || c.status === status)
          .filter((c) => category === undefined || c.category === category)
          .sort((a, b) => b.confidence - a.confidence);

        const key = `c|${repo.full_name}|${status}|${category ?? '*'}`;
        const offset = cursor === undefined ? 0 : decodeCursor(cursor, key);
        const detailed = response_format === 'detailed';
        const items = matching.map((c) => toConventionItem(c, detailed));
        const { page, nextCursor, stoppedByBudget } = takePage(items, {
          offset,
          limit,
          maxChars: ITEMS_BUDGET_CHARS,
          key,
        });

        return toolResult({
          repository: repo.full_name,
          conventions: page,
          counts,
          total_matching: matching.length,
          returned: page.length,
          next_cursor: nextCursor,
          message: buildMessage({
            fullName: repo.full_name,
            status,
            category,
            counts,
            totalMatching: matching.length,
            returned: page.length,
            nextCursor,
            stoppedByBudget,
          }),
        });
      }),
  );
}

function isListed(convention: ConventionCandidate): convention is ConventionCandidate & { status: Status } {
  return convention.status === 'accepted' || convention.status === 'pending';
}

function toConventionItem(convention: ConventionCandidate & { status: Status }, detailed: boolean) {
  const base = {
    category: convention.category,
    rule: sanitizeText(convention.rule, TEXT_CAPS.rule) ?? '',
    confidence: Math.round(convention.confidence * 100) / 100,
    status: convention.status,
  };
  if (!detailed) return base;

  const path = sanitizeText(convention.evidence_path, TEXT_CAPS.title);
  const snippet = sanitizeText(convention.evidence_snippet, TEXT_CAPS.snippet);
  return {
    ...base,
    ...(path ? { evidence: `${path}:${convention.evidence_line}` } : {}),
    ...(snippet ? { evidence_snippet: snippet } : {}),
    edited: convention.edited,
  };
}

interface MessageInput {
  fullName: string;
  status: 'accepted' | 'pending' | 'all';
  category: ConventionCategory | undefined;
  counts: { accepted: number; pending: number };
  totalMatching: number;
  returned: number;
  nextCursor: string | null;
  stoppedByBudget: boolean;
}

function buildMessage(m: MessageInput): string | null {
  if (m.nextCursor !== null) {
    const narrow = m.category === undefined ? ', or narrow with category' : '';
    const budget = m.stoppedByBudget
      ? ' Response size limit reached; use response_format "concise" or a smaller limit.'
      : '';
    return `Showing ${m.returned} of ${m.totalMatching} conventions, highest confidence first. Pass cursor "${m.nextCursor}" for the next page${narrow}.${budget}`;
  }
  if (m.totalMatching > 0) return null;

  if (m.counts.accepted + m.counts.pending === 0) {
    return `No conventions have been extracted for ${m.fullName} yet. Run a scan on DevDigest's Conventions page.`;
  }
  if (m.status === 'accepted' && m.counts.accepted === 0) {
    return `No accepted conventions for ${m.fullName} yet; ${m.counts.pending} pending candidates — pass status: "pending" to see them. Conventions are accepted on DevDigest's Conventions page.`;
  }
  // Not specified by the plan: a filter (status/category) that matches nothing in a repo that does have conventions.
  const scope = [m.status === 'all' ? null : m.status, 'conventions'].filter(Boolean).join(' ');
  const inCategory = m.category === undefined ? '' : ` in category "${m.category}"`;
  return `No ${scope}${inCategory} for ${m.fullName}. Counts: ${m.counts.accepted} accepted, ${m.counts.pending} pending. Try status: "all" or drop category.`;
}
