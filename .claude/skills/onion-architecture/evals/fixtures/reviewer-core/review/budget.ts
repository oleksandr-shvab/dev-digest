const CHARS_PER_TOKEN = 4;

export function approxTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export function fitToBudget(diff: string, maxTokens: number): string {
  if (approxTokens(diff) <= maxTokens) return diff;
  const files = diff.split(/^(?=diff --git )/m);
  const kept: string[] = [];
  let used = 0;
  for (const file of files) {
    const cost = approxTokens(file);
    if (used + cost > maxTokens) break;
    kept.push(file);
    used += cost;
  }
  const dropped = files.length - kept.length;
  return dropped > 0 ? `${kept.join('')}\n# ${dropped} file(s) omitted to fit the token budget\n` : kept.join('');
}
