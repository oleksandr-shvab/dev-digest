import type { ProjectContextDoc } from "@devdigest/shared";

export type AgoUnit = "seconds" | "minutes" | "hours" | "days";

/** Age of a timestamp as a unit and a whole number (rounded down), e.g. 125 s → minutes 2. */
export function ageOf(iso: string, now: number): { unit: AgoUnit; n: number } {
  const seconds = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return { unit: "seconds", n: seconds };
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return { unit: "minutes", n: minutes };
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { unit: "hours", n: hours };
  return { unit: "days", n: Math.floor(hours / 24) };
}

/** Sum of the listed docs' token counts (the footer's "≈ T tokens total"). */
export const sumTokens = (docs: ProjectContextDoc[]): number => docs.reduce((sum, d) => sum + d.tokens, 0);

/** Case-insensitive filter on the path. */
export function filterDocs(docs: ProjectContextDoc[], query: string): ProjectContextDoc[] {
  const q = query.trim().toLowerCase();
  return q ? docs.filter((d) => d.path.toLowerCase().includes(q)) : docs;
}
