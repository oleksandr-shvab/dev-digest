import { McpServer } from '@modelcontextprotocol/server';
import type { DevDigestApi } from './api/client.js';
import { PullRequestResolver } from './api/resolve.js';
import type { Clock } from './clock.js';
import { SERVER_INSTRUCTIONS } from './instructions.js';
import type { Logger } from './log.js';
import { registerGetBlastRadius } from './tools/get-blast-radius.js';
import { registerGetConventions } from './tools/get-conventions.js';
import { registerGetFindings } from './tools/get-findings.js';
import { registerListAgents } from './tools/list-agents.js';
import { registerRunAgentOnPullRequest } from './tools/run-agent-on-pull-request.js';
import type { ToolDeps } from './tools/shared.js';

export const SERVER_NAME = 'devdigest';
export const SERVER_VERSION = '0.1.0';

export interface DevDigestMcpServerDeps {
  api: DevDigestApi;
  logger: Logger;
  apiBaseUrl: string;
  runWaitMs: number;
  clock: Clock;
}

/**
 * Builds the MCP server with all tools. No I/O happens here (BP-05). It is also the factory
 * `serveStdio` calls, so it must stay cheap and side-effect free.
 */
export function createDevDigestMcpServer(deps: DevDigestMcpServerDeps): McpServer {
  const toolDeps: ToolDeps = { ...deps, pulls: new PullRequestResolver(deps.api) };
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION }, { instructions: SERVER_INSTRUCTIONS });
  registerListAgents(server, toolDeps);
  registerRunAgentOnPullRequest(server, toolDeps);
  registerGetBlastRadius(server, toolDeps);
  registerGetConventions(server, toolDeps);
  registerGetFindings(server, toolDeps);
  return server;
}
