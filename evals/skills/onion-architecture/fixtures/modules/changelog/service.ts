import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import type { PullRow } from '../reviews/repository.js';
import { loadDiff } from '../reviews/diff-loader.js';
import { fetchLinkedIssues } from '../reviews/intent-sources.js';
import { pickLatestReviewPerAgent } from '../reviews/smart-diff/build.js';
import { classifyFile } from '../reviews/smart-diff/classify.js';
import { ChangelogRepository, type ChangelogRow } from './repository.js';
import {
  groupByRole,
  pickHeadline,
  renderEntry,
  summaryModelFor,
  type ChangelogEntry,
} from './helpers.js';

const ISSUE_REF = /#(\d+)/g;

export class ChangelogService {
  private repo: ChangelogRepository;

  constructor(private container: Container) {
    this.repo = new ChangelogRepository(container.db);
  }

  async draftForPull(workspaceId: string, prId: string): Promise<ChangelogEntry> {
    const pull: PullRow | undefined = await this.container.reviewRepo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('pull');
    const repoRow = await this.container.reviewRepo.getRepo(pull.repoId);
    if (!repoRow) throw new NotFoundError('repo');

    const diff = await loadDiff(
      this.container,
      this.container.reviewRepo,
      workspaceId,
      pull,
      repoRow,
    );
    const files = diff.files.map((f) => ({ path: f.path, role: classifyFile(f.path) }));

    const issueNumbers = [...(pull.body ?? '').matchAll(ISSUE_REF)].map((m) => Number(m[1]));
    const linked = await fetchLinkedIssues(
      { github: () => this.container.github() },
      { repo: { owner: repoRow.owner, name: repoRow.name }, issueNumbers },
    );

    const latest = pickLatestReviewPerAgent(await this.container.reviewRepo.reviewsForPull(prId));
    const blocking = latest
      .flatMap((r) => r.findings)
      .filter((f) => f.severity === 'CRITICAL').length;

    const issueTitles = linked.flatMap((l) => (l.issue ? [l.issue.title] : []));
    return renderEntry(
      {
        title: pull.title,
        headline: pickHeadline(issueTitles, pull.title),
        groups: groupByRole(files),
        blocking,
      },
      await summaryModelFor(this.container, workspaceId),
    );
  }

  publish(workspaceId: string, prId: string, entry: ChangelogEntry): Promise<ChangelogRow> {
    if (entry.groups.length === 0) throw new NotFoundError('nothing to publish');
    return this.repo.insertEntry(workspaceId, prId, entry);
  }

  list(workspaceId: string): Promise<ChangelogRow[]> {
    return this.repo.listEntries(workspaceId);
  }
}
