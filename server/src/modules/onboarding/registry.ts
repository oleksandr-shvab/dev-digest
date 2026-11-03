/**
 * Process-local record of which repos are generating a tour right now and why
 * the last attempt failed. A server restart loses it; the stored tour stays.
 */

export interface GenerationSnapshot {
  generating: boolean;
  lastError: string | null;
}

export class TourGenerationRegistry {
  private entries = new Map<string, GenerationSnapshot>();

  /**
   * Synchronous check-and-set: the caller must not `await` between this call
   * and acting on its result (AC-21). Returns false while a run is in flight.
   */
  tryStart(repoId: string): boolean {
    if (this.entries.get(repoId)?.generating) return false;
    this.entries.set(repoId, { generating: true, lastError: null });
    return true;
  }

  /** Undo a `tryStart` that was refused after the fact; `lastError` stays cleared. */
  cancel(repoId: string): void {
    this.entries.set(repoId, { generating: false, lastError: this.snapshot(repoId).lastError });
  }

  succeed(repoId: string): void {
    this.entries.set(repoId, { generating: false, lastError: null });
  }

  fail(repoId: string, reason: string): void {
    this.entries.set(repoId, { generating: false, lastError: reason });
  }

  snapshot(repoId: string): GenerationSnapshot {
    return this.entries.get(repoId) ?? { generating: false, lastError: null };
  }
}
