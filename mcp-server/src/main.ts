// Must stay the first import: it redirects console.log/info/debug to stderr before anything else can print.
import './stdout-guard.js';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { DevDigestApi } from './api/client.js';
import { systemClock } from './clock.js';
import { loadMcpConfig, type McpConfig } from './config.js';
import { createLogger } from './log.js';
import { createDevDigestMcpServer } from './server.js';

// Composition root: the only place that builds DevDigestApi, picks the real clock and starts the transport.
let config: McpConfig;
try {
  config = loadMcpConfig();
} catch (err) {
  // No logger yet (its level comes from the config), and stdout is the JSON-RPC channel: stderr only.
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
}

const logger = createLogger(config.logLevel);
const api = new DevDigestApi({ baseUrl: config.apiBaseUrl, timeoutMs: config.requestTimeoutMs });

// No API call happens here (BP-05): the factory only registers tools. EOF on stdin tears the connection
// down; the only timer is the run tool's sleep during a call, which that same EOF aborts.
const handle = serveStdio(() =>
  createDevDigestMcpServer({
    api,
    logger,
    apiBaseUrl: config.apiBaseUrl,
    runWaitMs: config.runWaitMs,
    clock: systemClock,
  }),
);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void handle.close();
  });
}
process.on('unhandledRejection', (reason) => {
  logger.error('unhandled rejection', { reason: reason instanceof Error ? (reason.stack ?? reason.message) : String(reason) });
});

logger.info('devdigest MCP server ready', { apiBaseUrl: config.apiBaseUrl, runWaitMs: config.runWaitMs });
