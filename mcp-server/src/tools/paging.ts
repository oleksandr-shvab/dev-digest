import { ToolInputError } from '../api/resolve.js';

const INVALID_CURSOR = 'This cursor is not valid. Repeat the call without cursor to start from the first page.';

interface CursorPayload {
  o: number;
  k: string;
}

/** `key` identifies the query (tool + filters) so a cursor cannot be replayed against a different one. */
export function encodeCursor(offset: number, key: string): string {
  const payload: CursorPayload = { o: offset, k: key };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

/** The cursor comes from the agent, so it is untrusted: anything unexpected is a `ToolInputError`. */
export function decodeCursor(cursor: string, key: string): number {
  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw new ToolInputError(INVALID_CURSOR);
  }
  if (typeof payload !== 'object' || payload === null) throw new ToolInputError(INVALID_CURSOR);
  const { o, k } = payload as Partial<Record<keyof CursorPayload, unknown>>;
  if (typeof o !== 'number' || !Number.isSafeInteger(o) || o < 0 || typeof k !== 'string') {
    throw new ToolInputError(INVALID_CURSOR);
  }
  if (k !== key) {
    throw new ToolInputError(
      'This cursor belongs to a different query (filters changed). Repeat the call without cursor.',
    );
  }
  return o;
}

export interface TakePageOptions {
  offset: number;
  limit: number;
  maxChars: number;
  key: string;
}

export interface Page<T> {
  page: T[];
  nextCursor: string | null;
  /** True when the char budget (not `limit`) ended the page early. */
  stoppedByBudget: boolean;
}

/** Takes up to `limit` items from `offset` while their JSON stays within `maxChars`; always at least one item. */
export function takePage<T>(items: readonly T[], { offset, limit, maxChars, key }: TakePageOptions): Page<T> {
  const page: T[] = [];
  let chars = 0;
  let stoppedByBudget = false;
  for (let i = offset; i < items.length && page.length < limit; i++) {
    const item = items[i] as T;
    const itemChars = JSON.stringify(item).length + 1; // +1 for the separating comma
    if (page.length > 0 && chars + itemChars > maxChars) {
      stoppedByBudget = true;
      break;
    }
    page.push(item);
    chars += itemChars;
  }
  const next = offset + page.length;
  return { page, nextCursor: next < items.length ? encodeCursor(next, key) : null, stoppedByBudget };
}
