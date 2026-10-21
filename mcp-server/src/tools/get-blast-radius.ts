import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { pullRequestNumberField, repositoryField, runTool, toolError } from './shared.js';
import type { ToolDeps } from './shared.js';

export const GET_BLAST_RADIUS_TOOL = 'devdigest_get_blast_radius';

const inputSchema = z.object({
  repository: repositoryField,
  pull_request_number: pullRequestNumberField,
});

const STUB_TEXT = `devdigest_get_blast_radius is not implemented yet — this tool is a stub and has no data. Tell the user that blast-radius analysis is not available through DevDigest's MCP server yet. Do not estimate it and do not retry.`;

/** A stub: makes no API call and never returns data (BP-17). */
export function registerGetBlastRadius(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    GET_BLAST_RADIUS_TOOL,
    {
      title: 'Blast radius (not implemented)',
      description: `STUB — not implemented yet: always returns an error and no data. Planned: which code a pull request's changes can affect. Tell the user it is unavailable; do not estimate it.`,
      inputSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => runTool(GET_BLAST_RADIUS_TOOL, deps, async () => toolError(STUB_TEXT)),
  );
}
