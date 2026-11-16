import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import { ReviewRepository } from '../reviews/repository.js';
import { pickLatestReviewPerAgent } from '../reviews/smart-diff/build.js';
import { AgentsService } from '../agents/service.js';
import { DigestRepository, type DigestRow } from './repository.js';

export interface WeeklyDigest {
  weekStart: Date;
  pulls: { prId: string; title: string; critical: number; warnings: number; agents: string[] }[];
  topFiles: { path: string; findings: number }[];
}

function startOfWeek(d: Date): Date {
  const out = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  out.setUTCDate(out.getUTCDate() - ((out.getUTCDay() + 6) % 7));
  return out;
}

export class DigestService {
  private repo: DigestRepository;
  private reviews: ReviewRepository;
  private agents: AgentsService;

  constructor(private container: Container) {
    this.repo = new DigestRepository(container.db);
    this.reviews = new ReviewRepository(container.db);
    this.agents = new AgentsService(container);
  }

  async weekly(workspaceId: string, weekStart = new Date()): Promise<WeeklyDigest> {
    const from = startOfWeek(weekStart);
    const to = new Date(from.getTime() + 7 * 24 * 3600 * 1000);

    const prIds = await this.repo.reviewedPullIds(workspaceId, from, to);
    const agentNames = new Map(
      (await this.agents.list(workspaceId)).map((a) => [a.id, a.name] as const),
    );

    const pulls: WeeklyDigest['pulls'] = [];
    for (const prId of prIds) {
      const pull = await this.reviews.getPull(workspaceId, prId);
      if (!pull) continue;
      const latest = pickLatestReviewPerAgent(await this.reviews.reviewsForPull(prId));
      const all = latest.flatMap((r) => r.findings);
      pulls.push({
        prId,
        title: pull.title,
        critical: all.filter((f) => f.severity === 'CRITICAL').length,
        warnings: all.filter((f) => f.severity === 'WARNING').length,
        agents: latest.map((r) => agentNames.get(r.review.agentId ?? '') ?? 'unknown'),
      });
    }

    pulls.sort((a, b) => b.critical - a.critical || b.warnings - a.warnings);
    const topFiles = await this.repo.topFindingFiles(workspaceId, from, to, 10);
    return { weekStart: from, pulls, topFiles };
  }

  async saveSnapshot(workspaceId: string, digest: WeeklyDigest): Promise<DigestRow> {
    if (digest.pulls.length === 0) throw new NotFoundError('nothing reviewed this week');
    return this.repo.insertSnapshot(workspaceId, digest.weekStart, digest);
  }
}
