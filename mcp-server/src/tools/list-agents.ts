import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { responseFormatField, runTool, sanitizeText, TEXT_CAPS, toolResult } from './shared.js';
import type { ToolDeps } from './shared.js';

export const LIST_AGENTS_TOOL = 'devdigest_list_agents';

const inputSchema = z.object({
  response_format: responseFormatField('detailed adds strategy, gate policy and version'),
});

const outputSchema = z.object({
  agents: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      provider: z.string(),
      model: z.string(),
      enabled: z.boolean(),
      strategy: z.string().optional(),
      ci_fail_on: z.string().optional(),
      repo_intel: z.boolean().optional(),
      version: z.int().optional(),
    }),
  ),
  total: z.int(),
  message: z.string().nullable(),
});

const NO_AGENTS_MESSAGE = 'No reviewers are configured. Create one on the Agents page in DevDigest.';

export function registerListAgents(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    LIST_AGENTS_TOOL,
    {
      title: 'List DevDigest reviewers',
      description: `List the AI reviewers (agents) configured in DevDigest: name, what each checks, model, and whether it is enabled. Pass a name to devdigest_run_agent_on_pull_request or devdigest_get_findings.`,
      inputSchema,
      outputSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ response_format }) =>
      runTool(LIST_AGENTS_TOOL, deps, async () => {
        const agents = await deps.api.listAgents();
        const detailed = response_format === 'detailed';
        const descriptionCap = detailed ? TEXT_CAPS.agentDescriptionDetailed : TEXT_CAPS.agentDescriptionConcise;

        // Enabled reviewers first, then by name. Never expose id, system_prompt or output_schema (BP-06).
        const sorted = [...agents].sort(
          (a, b) => Number(b.enabled) - Number(a.enabled) || a.name.localeCompare(b.name),
        );
        const items = sorted.map((agent) => ({
          name: sanitizeText(agent.name, TEXT_CAPS.title) ?? '',
          description: sanitizeText(agent.description, descriptionCap) ?? '',
          provider: agent.provider,
          model: agent.model,
          enabled: agent.enabled,
          ...(detailed
            ? {
                strategy: agent.strategy,
                ci_fail_on: agent.ci_fail_on,
                repo_intel: agent.repo_intel,
                version: agent.version,
              }
            : {}),
        }));

        return toolResult({
          agents: items,
          total: items.length,
          message: items.length === 0 ? NO_AGENTS_MESSAGE : null,
        });
      }),
  );
}
