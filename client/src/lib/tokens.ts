/** Advisory token estimate — `ceil(chars / 4)`. The exact count lives in the run trace. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Enabled skills above this many estimated tokens trigger a budget warning. */
export const SKILL_TOKEN_WARN = 4000;
