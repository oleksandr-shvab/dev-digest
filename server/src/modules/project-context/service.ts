import {
  AttachmentPath,
  type GitTreeEntry,
  type ProjectContextDoc,
  type ProjectContextDocContent,
  type ProjectContextList,
  type RepoRef,
} from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { NotFoundError, ValidationError } from '../../platform/errors.js';
import { MAX_LISTED_DOCS, TOKEN_CACHE_MAX } from './constants.js';
import {
  compileGlobs,
  countUsedBy,
  decodeUtf8,
  docTypeFor,
  isEligibleEntry,
  orderAttachedPaths,
  planBudget,
  selectDocs,
  type CollectedDoc,
} from './helpers.js';
import { ProjectContextRepository } from './repository.js';

export interface CollectedProjectContext {
  /** The commit every doc was read at; `null` when the mirror could not be read. */
  commit: string | null;
  docs: CollectedDoc[];
}

/**
 * Project context: browse a repo's Markdown docs and read the attached ones for
 * a run. Docs are read from git objects of the synced default-branch mirror at
 * ONE commit (`ls-tree` + `cat-file`); no filesystem path is ever joined from
 * user input, so a symlink or `..` cannot reach outside the repository.
 */
export class ProjectContextService {
  private repo: ProjectContextRepository;
  /** blob sha -> token count. A blob's content never changes, so this never goes stale. */
  private tokenCache = new Map<string, number>();

  constructor(private container: Container) {
    this.repo = new ProjectContextRepository(container.db);
  }

  async listDocs(workspaceId: string, repoId: string): Promise<ProjectContextList> {
    const repo = await this.repo.getRepo(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');

    const { config } = this.container;
    const base = {
      repo_id: repo.id,
      globs: config.projectContextGlobs,
      scanned_at: new Date().toISOString(),
      budget_tokens: config.projectContextBudgetTokens,
    };

    let commit: string;
    let selected: GitTreeEntry[];
    let blobs: Map<string, Buffer | null>;
    let listed: GitTreeEntry[];
    try {
      commit = await this.container.git.currentHead(repo);
      const entries = await this.container.git.listTree(repo, commit);
      selected = selectDocs(entries, compileGlobs(config.projectContextGlobs));
      listed = selected.slice(0, MAX_LISTED_DOCS);
      blobs = await this.container.git.readBlobs(
        repo,
        listed.map((e) => e.blob),
      );
    } catch {
      // The mirror's existence is decided by the git calls, not by repos.clone_path.
      return { ...base, status: 'no_mirror', commit: null, total: 0, docs: [] };
    }

    const { agents, links } = await this.repo.attachmentsForUsage(workspaceId);
    const usedBy = countUsedBy(agents, links);

    const docs: ProjectContextDoc[] = [];
    for (const entry of listed) {
      const bytes = blobs.get(entry.blob);
      const text = bytes ? decodeUtf8(bytes) : null;
      if (text === null) continue; // unreadable or not UTF-8: cannot be used, so not offered
      docs.push({
        path: entry.path,
        type: docTypeFor(entry.path),
        size: entry.size,
        tokens: this.tokensFor(entry.blob, text),
        used_by: usedBy.get(entry.path) ?? 0,
      });
    }

    return {
      ...base,
      status: selected.length === 0 ? 'no_matches' : 'ok',
      commit,
      total: selected.length,
      docs,
    };
  }

  async readDoc(workspaceId: string, repoId: string, path: string): Promise<ProjectContextDocContent> {
    const parsed = AttachmentPath.safeParse(path);
    if (!parsed.success) throw new ValidationError('Invalid document path');
    const repo = await this.repo.getRepo(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');

    let entry: GitTreeEntry | undefined;
    let bytes: Buffer | null | undefined;
    try {
      const commit = await this.container.git.currentHead(repo);
      const entries = await this.container.git.listTree(repo, commit);
      entry = entries.find((e) => e.path === parsed.data && isEligibleEntry(e));
      if (entry) bytes = (await this.container.git.readBlobs(repo, [entry.blob])).get(entry.blob);
    } catch {
      throw new NotFoundError('Document not found');
    }
    const content = entry && bytes ? decodeUtf8(bytes) : null;
    if (!entry || content === null) throw new NotFoundError('Document not found');

    return {
      path: entry.path,
      type: docTypeFor(entry.path),
      size: entry.size,
      tokens: this.tokensFor(entry.blob, content),
      content,
    };
  }

  /**
   * Read the attached docs of one run at a single commit and fit them to the
   * token budget. Never throws: when the mirror cannot be read, every path is
   * `missing` and `commit` is `null`. A path counts as present when it is an
   * eligible tree entry — the globs only apply to listing, so an attachment
   * survives a glob change.
   */
  async collectForRun(input: { repo: RepoRef; paths: string[] }): Promise<CollectedProjectContext> {
    const { repo, paths } = input;
    const allMissing = (): CollectedProjectContext => ({
      commit: null,
      docs: paths.map((path) => ({ path, tokens: 0, status: 'missing' as const })),
    });
    if (paths.length === 0) return { commit: null, docs: [] };

    try {
      const commit = await this.container.git.currentHead(repo);
      const entries = await this.container.git.listTree(repo, commit);
      const byPath = new Map(entries.filter(isEligibleEntry).map((e) => [e.path, e]));
      const wanted = [...new Set(paths.flatMap((p) => byPath.get(p)?.blob ?? []))];
      const blobs = await this.container.git.readBlobs(repo, wanted);

      const collected: CollectedDoc[] = paths.map((path) => {
        const entry = byPath.get(path);
        const bytes = entry ? blobs.get(entry.blob) : null;
        const text = bytes ? decodeUtf8(bytes) : null;
        if (!entry || text === null) return { path, tokens: 0, status: 'missing' };
        return { path, tokens: this.tokensFor(entry.blob, text), status: 'included', text };
      });
      return {
        commit,
        docs: planBudget(collected, this.container.config.projectContextBudgetTokens),
      };
    } catch {
      return allMissing();
    }
  }

  /**
   * The workspace's attached docs for the PR brief: the ordered, deduplicated
   * union over every agent (disabled ones included) of its own paths and its
   * enabled skills' paths, read like a run reads them. Never throws.
   */
  async collectWorkspaceSpecs(
    workspaceId: string,
    repo: RepoRef,
  ): Promise<CollectedProjectContext & { paths: string[] }> {
    const { agents, links } = await this.repo.attachmentsForUsage(workspaceId);
    const seen = new Set<string>();
    const paths: string[] = [];
    for (const agent of agents) {
      const perSkill = links.filter((l) => l.agentId === agent.id).map((l) => l.contextPaths);
      for (const path of orderAttachedPaths(agent.contextPaths, perSkill)) {
        if (seen.has(path)) continue;
        seen.add(path);
        paths.push(path);
      }
    }
    return { ...(await this.collectForRun({ repo, paths })), paths };
  }

  private tokensFor(blob: string, text: string): number {
    const cached = this.tokenCache.get(blob);
    if (cached !== undefined) return cached;
    const tokens = this.container.tokenizer.count(text);
    if (this.tokenCache.size >= TOKEN_CACHE_MAX) {
      const oldest = this.tokenCache.keys().next().value;
      if (oldest !== undefined) this.tokenCache.delete(oldest);
    }
    this.tokenCache.set(blob, tokens);
    return tokens;
  }
}
