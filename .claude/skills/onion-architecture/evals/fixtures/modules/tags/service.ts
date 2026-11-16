import { and, eq, inArray } from 'drizzle-orm';
import type { Container } from '../../platform/container.js';
import { OctokitGitHubClient } from '../../adapters/github/octokit.js';
import * as t from '../../db/schema.js';
import { ConflictError, NotFoundError } from '../../platform/errors.js';
import { TagRepository, type TagRow } from './repository.js';

const DEFAULT_LABEL_COLOR = '#8b949e';

export class TagService {
  private repo: TagRepository;

  constructor(private container: Container) {
    this.repo = new TagRepository(container.db);
  }

  list(workspaceId: string): Promise<TagRow[]> {
    return this.repo.listTags(workspaceId);
  }

  async create(workspaceId: string, input: { name: string; color: string }): Promise<TagRow> {
    const name = input.name.trim().toLowerCase();
    const existing = await this.repo.findByName(workspaceId, name);
    if (existing) throw new ConflictError(`tag "${name}" already exists`);
    return this.repo.insertTag({ workspaceId, name, color: input.color, system: false });
  }

  async syncLabelsFromGitHub(workspaceId: string, prId: string): Promise<{ attached: number }> {
    const pull = await this.container.reviewRepo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('pull');
    const repo = await this.container.reviewRepo.getRepo(pull.repoId);
    if (!repo) throw new NotFoundError('repo');

    const token = await this.container.secrets.get('GITHUB_TOKEN');
    const gh = new OctokitGitHubClient(token ?? '');
    const detail = await gh.getPullRequest({ owner: repo.owner, name: repo.name }, pull.number);
    const labelNames = detail.labels.map((l) => l.name.trim().toLowerCase());
    if (labelNames.length === 0) return { attached: 0 };

    const known = await this.container.db
      .select()
      .from(t.tags)
      .where(and(eq(t.tags.workspaceId, workspaceId), inArray(t.tags.name, labelNames)));
    const knownNames = new Set(known.map((k) => k.name));

    const created: TagRow[] = [];
    for (const name of labelNames) {
      if (knownNames.has(name)) continue;
      created.push(
        await this.repo.insertTag({ workspaceId, name, color: DEFAULT_LABEL_COLOR, system: true }),
      );
    }

    const ids = [...known, ...created].map((tag) => tag.id);
    await this.repo.attachTags(prId, ids);
    return { attached: ids.length };
  }
}
