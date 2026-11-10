import { describe, expect, it, vi } from 'vitest';
import { BriefService } from '../src/modules/brief/service.js';
import type { Container } from '../src/platform/container.js';
import { AppError, ConflictError, NotFoundError } from '../src/platform/errors.js';

const noopLog = { info: () => undefined, warn: () => undefined, error: () => undefined, debug: () => undefined };

const PULL = { id: 'pr-1', headSha: 'aaa', title: 't', body: null, repoId: 'r1', branch: 'b', base: 'main' };

/**
 * A container with only what the guards in front of the model call touch. The
 * `llm` factory is a spy: none of these paths may reach it.
 */
function fakeContainer(over: {
  getPull?: () => Promise<unknown>;
  getPrFiles?: () => Promise<unknown[]>;
  dbSelect?: () => never;
}) {
  const llm = vi.fn();
  const getPrFiles = vi.fn(over.getPrFiles ?? (async () => [{ path: 'a.ts' }]));
  const container = {
    db: { select: over.dbSelect ?? (() => { throw new Error('db down'); }) },
    reviewRepo: { getPull: over.getPull ?? (async () => PULL), getPrFiles },
    llm,
  } as unknown as Container;
  return { container, llm, getPrFiles };
}

describe('BriefService guards before the model call', () => {
  it('releases the generation guard when the state cannot be read, so a retry is not a 409 (AC-23)', async () => {
    const { container, llm } = fakeContainer({});
    const service = new BriefService(container);

    await expect(service.startGeneration('ws', 'pr-1', noopLog)).rejects.toThrow('db down');
    // Had the first attempt leaked its tryStart, this would be a ConflictError.
    const second = service.startGeneration('ws', 'pr-1', noopLog);
    await expect(second).rejects.toThrow('db down');
    await expect(second).rejects.not.toBeInstanceOf(ConflictError);
    expect(llm).not.toHaveBeenCalled();
  });

  it("is a 404 for a PR outside the workspace and claims no generation slot (AC-26)", async () => {
    const { container, getPrFiles, llm } = fakeContainer({ getPull: async () => undefined });
    const service = new BriefService(container);

    await expect(service.getState('ws', 'pr-x')).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.startGeneration('ws', 'pr-x', noopLog)).rejects.toBeInstanceOf(NotFoundError);
    expect(getPrFiles).not.toHaveBeenCalled();
    expect(llm).not.toHaveBeenCalled();
  });

  it('answers 409 no_changed_files without a model call and without holding the slot (AC-29)', async () => {
    let files: unknown[] = [];
    const { container, llm } = fakeContainer({ getPrFiles: async () => files });
    const service = new BriefService(container);

    const err = await service.startGeneration('ws', 'pr-1', noopLog).catch((e) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err).toMatchObject({ code: 'no_changed_files', statusCode: 409 });
    expect(llm).not.toHaveBeenCalled();

    // Once files are synced the same PR can start: the slot was never taken (db stub then fails the state read).
    files = [{ path: 'a.ts' }];
    const next = await service.startGeneration('ws', 'pr-1', noopLog).catch((e) => e);
    expect(next).not.toBeInstanceOf(ConflictError);
    expect(next).not.toMatchObject({ code: 'no_changed_files' });
  });
});
