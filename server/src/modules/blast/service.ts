import type { BlastRadius } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import type { PinoLike } from '../../platform/run-logger.js';
import { NotFoundError } from '../../platform/errors.js';
import { countBlast, toBlastRadius } from './helpers.js';

export class BlastService {
  constructor(private readonly container: Container) {}

  /**
   * The blast radius of a PR, read from the repo-intel index.
   * Reads only: no model, no GitHub, no index or resync job.
   */
  async blastRadius(workspaceId: string, prId: string, log: PinoLike): Promise<BlastRadius> {
    const startedAt = Date.now();

    // The workspace-scoped lookup comes first: the repo-intel facade is tenant-agnostic,
    // and the repo id must come from this row, never from the request.
    const pull = await this.container.reviewRepo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    const changedFiles = (await this.container.reviewRepo.getPrFiles(prId)).map((f) => f.path);
    const result = await this.container.repoIntel.getBlastRadius(pull.repoId, changedFiles);
    const state = await this.container.repoIntel.getIndexState(pull.repoId);

    const blast = toBlastRadius(result, state.status);
    const counts = countBlast(blast);

    log.info(
      {
        prId,
        indexStatus: state.status,
        changedFiles: changedFiles.length,
        ...counts,
        degraded: blast.degraded,
        reason: blast.reason ?? null,
        ms: Date.now() - startedAt,
      },
      'blast radius read',
    );
    return blast;
  }
}
