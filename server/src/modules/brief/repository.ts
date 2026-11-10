import { eq } from 'drizzle-orm';
import type { BriefOmittedInput, BriefUnavailableInput, PrBrief } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/**
 * Brief data-access. The ONLY layer touching the `pr_brief` table. It is keyed
 * by `pr_id`; callers pass a PR id the service has already checked against the
 * workspace (`ReviewRepository.getPull`).
 */
export type BriefRow = typeof t.prBrief.$inferSelect;

export interface UpsertBrief {
  prId: string;
  json: PrBrief;
  headSha: string;
  generatedAt: Date;
  provider: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number | null;
  unavailableInputs: BriefUnavailableInput[];
  omittedInputs: BriefOmittedInput[];
}

export class BriefRepository {
  constructor(private db: Db) {}

  async get(prId: string): Promise<BriefRow | undefined> {
    const [row] = await this.db.select().from(t.prBrief).where(eq(t.prBrief.prId, prId));
    return row;
  }

  /** One brief per PR: a new generation replaces the stored one. */
  async upsert(values: UpsertBrief): Promise<void> {
    const { prId, ...set } = values;
    await this.db
      .insert(t.prBrief)
      .values({ prId, ...set })
      .onConflictDoUpdate({ target: t.prBrief.prId, set });
  }
}
