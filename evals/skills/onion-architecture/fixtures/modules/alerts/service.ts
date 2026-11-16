import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import { pickLatestReviewPerAgent } from '../reviews/smart-diff/build.js';
import { DEDUPE_WINDOW_MS } from './constants.js';
import { deliver } from './delivery.js';
import { filterRecent } from './dedupe.js';
import { dedupeKeyFor, formatAlert } from './formatters.js';
import { loadRules } from './recipients.js';
import { AlertRepository } from './repository.js';
import { bucketForPull, matchRules } from './rules.js';
import type {
  AlertCandidate,
  AlertMessage,
  AlertRule,
  AlertSeverity,
  DeliveryReport,
} from './types.js';

const FINDING_TO_ALERT: Record<string, AlertSeverity> = {
  CRITICAL: 'critical',
  WARNING: 'warning',
  SUGGESTION: 'info',
};

export class AlertService {
  private repo: AlertRepository;

  constructor(private container: Container) {
    this.repo = new AlertRepository(container.db);
  }

  listRules(workspaceId: string): Promise<AlertRule[]> {
    return this.repo.listRules(workspaceId);
  }

  async notifyForPull(workspaceId: string, prId: string): Promise<DeliveryReport> {
    const pull = await this.container.reviewRepo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('pull');

    const latest = pickLatestReviewPerAgent(await this.container.reviewRepo.reviewsForPull(prId));
    const rules = await loadRules(this.container, workspaceId);
    if (rules.length === 0) return { sent: 0, skipped: 0, failed: [] };

    const messages: AlertMessage[] = [];
    for (const entry of latest) {
      const severities = entry.findings.map((f) => FINDING_TO_ALERT[f.severity] ?? 'info');
      const bucket = bucketForPull(severities);
      if (!bucket) continue;

      const candidate: AlertCandidate = {
        prId,
        prTitle: pull.title,
        severity: bucket,
        findingCount: severities.length,
        agentName: entry.review.agentId ?? 'unknown',
      };
      for (const rule of matchRules(rules, candidate)) {
        messages.push({
          channel: rule.channel,
          target: rule.target,
          text: formatAlert(candidate),
          dedupeKey: dedupeKeyFor(rule, candidate),
        });
      }
    }

    const since = new Date(Date.now() - DEDUPE_WINDOW_MS);
    const recent = await this.repo.recentDedupeKeys(workspaceId, since);
    const fresh = filterRecent(messages, recent, Date.now());

    const report = await deliver(this.container, fresh);
    await this.repo.recordSent(
      workspaceId,
      fresh.slice(0, report.sent).map((m) => m.dedupeKey),
    );
    return { ...report, skipped: report.skipped + (messages.length - fresh.length) };
  }
}
