import Anthropic from '@anthropic-ai/sdk';
import { and, eq, gte, sql } from 'drizzle-orm';
import type {
  CompletionRequest,
  CompletionResult,
  LLMProvider,
  ModelInfo,
  StructuredRequest,
  StructuredResult,
} from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import { AnthropicProvider } from './anthropic.js';
import { priceFor } from './pricing.js';

export class BudgetExceededError extends Error {}

export class BudgetedAnthropicProvider implements LLMProvider {
  readonly id = 'anthropic' as const;
  private inner: AnthropicProvider;

  constructor(
    apiKey: string,
    private db: Db,
    private workspaceId: string,
    private monthlyCapUsd: number,
  ) {
    this.inner = new AnthropicProvider(new Anthropic({ apiKey }));
  }

  listModels(): Promise<ModelInfo[]> {
    return this.inner.listModels();
  }

  embed(texts: string[]): Promise<number[][]> {
    return this.inner.embed(texts);
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    await this.assertUnderCap();
    const res = await this.inner.complete(req);
    await this.record(req.model, res.usage.inputTokens, res.usage.outputTokens);
    return res;
  }

  async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    await this.assertUnderCap();
    let attempt = 0;
    for (;;) {
      try {
        const res = await this.inner.completeStructured(req);
        await this.record(req.model, res.usage.inputTokens, res.usage.outputTokens);
        return res;
      } catch (err) {
        if (++attempt >= 3) throw err;
        await this.assertUnderCap();
      }
    }
  }

  private async assertUnderCap(): Promise<void> {
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const [row] = await this.db
      .select({ spent: sql<number>`coalesce(sum(${t.agentRuns.costUsd}), 0)` })
      .from(t.agentRuns)
      .where(and(eq(t.agentRuns.workspaceId, this.workspaceId), gte(t.agentRuns.startedAt, monthStart)));
    const spent = Number(row?.spent ?? 0);
    if (spent >= this.monthlyCapUsd * 0.8) {
      await this.db.insert(t.notifications).values({
        workspaceId: this.workspaceId,
        kind: 'llm_budget_warning',
        payload: { spent, cap: this.monthlyCapUsd },
      });
    }
    if (spent >= this.monthlyCapUsd) {
      throw new BudgetExceededError(`monthly LLM cap of $${this.monthlyCapUsd} reached`);
    }
  }

  private async record(model: string, inputTokens: number, outputTokens: number): Promise<void> {
    const price = priceFor(model);
    await this.db.insert(t.llmUsage).values({
      workspaceId: this.workspaceId,
      model,
      inputTokens,
      outputTokens,
      costUsd: (inputTokens * price.inputPerMTok + outputTokens * price.outputPerMTok) / 1_000_000,
    });
  }
}
