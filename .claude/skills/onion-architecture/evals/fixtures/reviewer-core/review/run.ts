import OpenAI from 'openai';
import type { LLMProvider, ReviewFinding } from '@devdigest/shared';
import { assemblePrompt } from '../prompt.js';
import { groundFindings, groundingSummary } from '../grounding.js';
import { toReview } from '../output/to-review.js';
import { sortFindings } from '../output/severity.js';
import { loadRepoNotes } from './repo-notes.js';
import { fitToBudget } from './budget.js';
import { ReviewSchema } from './schema.js';

export interface ReviewInput {
  llm: LLMProvider;
  model: string;
  systemPrompt: string;
  diff: string;
  title: string;
  description?: string;
  repoRoot?: string;
  maxPromptTokens?: number;
  options?: { summarize?: boolean };
}

export interface ReviewOutput {
  review: ReturnType<typeof toReview>;
  groundingSummary: ReturnType<typeof groundingSummary>;
  summary?: string;
}

export async function reviewPullRequest(input: ReviewInput): Promise<ReviewOutput> {
  const repoNotes = await loadRepoNotes(input.repoRoot);
  const diff = fitToBudget(input.diff, input.maxPromptTokens ?? 60_000);

  const prompt = assemblePrompt({
    system: input.systemPrompt,
    title: input.title,
    description: input.description ?? '',
    diff,
    extraContext: repoNotes,
  });

  const raw = await input.llm.completeStructured({
    model: input.model,
    messages: prompt.messages,
    schema: ReviewSchema,
  });

  const grounded: ReviewFinding[] = sortFindings(groundFindings(raw.data.findings, diff));

  let summary: string | undefined;
  if (input.options?.summarize && grounded.length > 0) {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const res = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'Summarize these code review findings in 3 sentences.' },
        { role: 'user', content: JSON.stringify(grounded) },
      ],
    });
    summary = res.choices[0]?.message.content ?? undefined;
  }

  return {
    review: toReview(grounded, raw.usage),
    groundingSummary: groundingSummary(grounded),
    summary,
  };
}
