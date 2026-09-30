import { z } from 'zod';
import { ConventionCategory } from '@devdigest/shared';
import type { FileSample } from './sampling.js';
import { CONVENTION_EXTRACTION_SCHEMA_NAME, MAX_CANDIDATES } from './constants.js';

/**
 * The model call (Decision 3): one structured completion, given only the
 * code-sampled files (Decision 2 — the model never picks files itself).
 */

export { CONVENTION_EXTRACTION_SCHEMA_NAME };

export const ConventionExtractionSchema = z.object({
  candidates: z
    .array(
      z.object({
        category: ConventionCategory,
        rule: z.string().min(1).max(500),
        evidence: z.object({
          path: z.string().min(1),
          line: z.number().int().positive(),
          snippet: z.string().min(1),
        }),
        confidence: z.number().min(0).max(1),
      }),
    )
    .max(MAX_CANDIDATES),
});
export type ConventionExtraction = z.infer<typeof ConventionExtractionSchema>;

export const CONVENTIONS_SYSTEM_PROMPT = `# Role
You extract the coding conventions a repository already follows, from a small
sample of its own files. A later step turns your candidates into a skill that
a review agent uses to check future pull requests.

# What to propose
- Rules a reviewer could mechanically check against a diff: naming, file/module
  structure, import ordering, typing style, error handling, test shape,
  formatting.
- Something that actually recurs across the sample — not a one-off.
- Nothing a linter/formatter config would already catch (the sample includes
  eslint/tsconfig/prettier configs precisely so you can skip what they enforce).

# Evidence
For every candidate, cite ONE place in the sampled files that shows the rule:
the exact file path as given in the sample headers (\`### path\`), the 1-based
line number from the \`NNNN | code\` gutter, and the line's code copied
VERBATIM (whitespace may be trimmed, but do not paraphrase it). A candidate
whose evidence cannot be found in the file it names is worthless — copy the
snippet exactly.

# Output
Return up to ${MAX_CANDIDATES} candidates, each with a confidence in [0,1]
reflecting how consistently the sample follows it. No prose outside the
JSON.`;

/** The user message: everything the model actually gets to look at. */
export function buildConventionsUserMessage(repoFullName: string, samples: FileSample[]): string {
  const body = samples.map((s) => s.rendered).join('\n\n');
  return `Files sampled from ${repoFullName}:\n\n${body}\n\nPropose convention candidates from these files only.`;
}
