import type { AlertSeverity } from './types.js';

export const ALERT_THRESHOLDS: Record<AlertSeverity, number> = {
  info: 1,
  warning: 3,
  critical: 1,
};

export const SEVERITY_RANK: Record<AlertSeverity, number> = {
  info: 0,
  warning: 1,
  critical: 2,
};

export const DEDUPE_WINDOW_MS = 6 * 60 * 60 * 1000;
export const MAX_MESSAGES_PER_RUN = 25;
export const SLACK_TOKEN_SECRET = 'SLACK_BOT_TOKEN';
