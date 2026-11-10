/**
 * Process-local record of which PRs are generating a brief right now and why
 * the last attempt failed. A server restart loses it; the stored brief stays.
 */

export interface GenerationSnapshot {
  generating: boolean;
  lastError: string | null;
}

export class BriefGenerationRegistry {
  private entries = new Map<string, GenerationSnapshot>();

  /**
   * Synchronous check-and-set: the caller must not `await` between this call
   * and acting on its result (AC-23). Returns false while a run is in flight.
   */
  tryStart(prId: string): boolean {
    if (this.entries.get(prId)?.generating) return false;
    this.entries.set(prId, { generating: true, lastError: null });
    return true;
  }

  /** Undo a `tryStart` that was refused after the fact; `lastError` stays as it was. */
  cancel(prId: string): void {
    this.entries.set(prId, { generating: false, lastError: this.snapshot(prId).lastError });
  }

  succeed(prId: string): void {
    this.entries.set(prId, { generating: false, lastError: null });
  }

  fail(prId: string, reason: string): void {
    this.entries.set(prId, { generating: false, lastError: reason });
  }

  snapshot(prId: string): GenerationSnapshot {
    return this.entries.get(prId) ?? { generating: false, lastError: null };
  }
}
