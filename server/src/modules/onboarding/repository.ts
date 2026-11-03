import { eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/**
 * Onboarding data-access. The ONLY layer touching the `onboarding` table.
 * The table is keyed by `repo_id`; callers pass a repo id that the service has
 * already checked against the workspace (`RepoRepository.getById`).
 */
export type OnboardingRow = typeof t.onboarding.$inferSelect;

export interface UpsertOnboarding {
  repoId: string;
  json: unknown;
  generatedAt: Date;
  commitSha: string;
  indexFileCount: number;
  indexStatus: NonNullable<OnboardingRow['indexStatus']>;
}

export class OnboardingRepository {
  constructor(private db: Db) {}

  async get(repoId: string): Promise<OnboardingRow | undefined> {
    const [row] = await this.db.select().from(t.onboarding).where(eq(t.onboarding.repoId, repoId));
    return row;
  }

  /** One tour per repo: a new generation replaces the stored one. */
  async upsert(values: UpsertOnboarding): Promise<void> {
    const set = {
      json: values.json,
      generatedAt: values.generatedAt,
      commitSha: values.commitSha,
      indexFileCount: values.indexFileCount,
      indexStatus: values.indexStatus,
    };
    await this.db
      .insert(t.onboarding)
      .values({ repoId: values.repoId, ...set })
      .onConflictDoUpdate({ target: t.onboarding.repoId, set });
  }
}
