export type LogLevel = 'silent' | 'error' | 'info' | 'debug';

export interface Logger {
  error(msg: string, data?: Record<string, unknown>): void;
  info(msg: string, data?: Record<string, unknown>): void;
  debug(msg: string, data?: Record<string, unknown>): void;
}

/** Lowest rank = most important; a message is written when its rank <= the configured level's rank. */
const RANK: Record<LogLevel, number> = { silent: -1, error: 0, info: 1, debug: 2 };

/**
 * One JSON line per call, always on stderr: stdout is the MCP JSON-RPC channel
 * and must carry nothing else.
 */
export function createLogger(level: LogLevel): Logger {
  const write = (callLevel: Exclude<LogLevel, 'silent'>, msg: string, data?: Record<string, unknown>): void => {
    if (RANK[callLevel] > RANK[level]) return;
    process.stderr.write(`${JSON.stringify({ t: new Date().toISOString(), level: callLevel, msg, ...data })}\n`);
  };
  return {
    error: (msg, data) => write('error', msg, data),
    info: (msg, data) => write('info', msg, data),
    debug: (msg, data) => write('debug', msg, data),
  };
}
