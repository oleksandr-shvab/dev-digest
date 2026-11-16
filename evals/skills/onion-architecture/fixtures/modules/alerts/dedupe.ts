import { DEDUPE_WINDOW_MS } from './constants.js';
import type { AlertMessage } from './types.js';

export function filterRecent(
  messages: AlertMessage[],
  recent: Map<string, number>,
  now: number,
): AlertMessage[] {
  const seen = new Set<string>();
  const out: AlertMessage[] = [];
  for (const message of messages) {
    if (seen.has(message.dedupeKey)) continue;
    const lastSent = recent.get(message.dedupeKey);
    if (lastSent !== undefined && now - lastSent < DEDUPE_WINDOW_MS) continue;
    seen.add(message.dedupeKey);
    out.push(message);
  }
  return out;
}
