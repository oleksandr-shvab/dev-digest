import type { Container } from '../../platform/container.js';
import { UsageRepository, type UsageSummary } from './repository.js';

export class UsageService {
  private repo: UsageRepository;

  constructor(container: Container) {
    this.repo = new UsageRepository(container.db);
  }

  getMonthlySpend(workspaceId: string): Promise<number> {
    return this.repo.monthlySpend(workspaceId);
  }

  getCap(workspaceId: string): Promise<number | null> {
    return this.repo.getCap(workspaceId);
  }

  setCap(workspaceId: string, capUsd: number): Promise<void> {
    return this.repo.setCap(workspaceId, capUsd);
  }

  getSummary(workspaceId: string): Promise<UsageSummary> {
    return this.repo.summary(workspaceId);
  }
}
