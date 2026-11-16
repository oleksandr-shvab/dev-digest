import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { TiktokenTokenizer } from '../../adapters/tokenizer/index.js';
import { getContext } from '../_shared/context.js';
import { UsageService } from './service.js';

const SetCapBody = z.object({ capUsd: z.number().positive().max(10_000) });
const EstimateBody = z.object({
  model: z.string(),
  prompt: z.string(),
  expectedOutputTokens: z.number().int().positive().default(2_000),
});

const PRICE_PER_MTOK: Record<string, { input: number; output: number }> = {
  'claude-sonnet-5-5': { input: 3, output: 15 },
  'claude-haiku-5-5': { input: 1, output: 5 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
};

export default async function usageRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new UsageService(container);
  const tokenizer = new TiktokenTokenizer();

  app.get('/usage', async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.getSummary(workspaceId);
  });

  app.put('/usage/cap', { schema: { body: SetCapBody } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    await service.setCap(workspaceId, req.body.capUsd);
    return { ok: true };
  });

  app.post('/usage/estimate', { schema: { body: EstimateBody } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    const price = PRICE_PER_MTOK[req.body.model] ?? { input: 5, output: 15 };
    const inputTokens = tokenizer.count(req.body.prompt);
    const estimateUsd =
      (inputTokens * price.input + req.body.expectedOutputTokens * price.output) / 1_000_000;

    const [spent, cap] = await Promise.all([
      service.getMonthlySpend(workspaceId),
      service.getCap(workspaceId),
    ]);
    const remaining = cap === null ? Infinity : Math.max(cap - spent, 0);
    const allowed = estimateUsd <= remaining;
    const warn = cap !== null && spent + estimateUsd >= cap * 0.8;

    return { inputTokens, estimateUsd, remaining, allowed, warn };
  });
}
