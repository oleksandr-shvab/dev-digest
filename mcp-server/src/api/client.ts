import type {
  Agent,
  ApiErrorBody,
  ConventionCandidate,
  PrMeta,
  Repo,
  ReviewRecord,
  ReviewRunResponse,
  RunRequest,
  RunSummary,
} from '@devdigest/shared';

/** `status` 0 means the API never answered; then `code` is `'timeout'` or `'network_error'`. */
export class DevDigestApiError extends Error {
  readonly status: number;
  readonly code: string | undefined;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'DevDigestApiError';
    this.status = status;
    this.code = code;
  }
}

export interface DevDigestApiOptions {
  baseUrl: string;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
}

/**
 * Thin HTTP wrapper over the local DevDigest API. Responses are typed by a cast, not parsed
 * (as `client/src/lib/api.ts` does). There is deliberately no method that cancels or deletes a run.
 */
export class DevDigestApi {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: DevDigestApiOptions) {
    this.baseUrl = opts.baseUrl;
    this.timeoutMs = opts.timeoutMs;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  listAgents(): Promise<Agent[]> {
    return this.request<Agent[]>('GET', '/agents');
  }

  listRepos(): Promise<Repo[]> {
    return this.request<Repo[]>('GET', '/repos');
  }

  listPulls(repoId: string): Promise<PrMeta[]> {
    return this.request<PrMeta[]>('GET', `/repos/${encodeURIComponent(repoId)}/pulls`);
  }

  listRuns(pullRequestId: string): Promise<RunSummary[]> {
    return this.request<RunSummary[]>('GET', `/pulls/${encodeURIComponent(pullRequestId)}/runs`);
  }

  listReviews(pullRequestId: string): Promise<ReviewRecord[]> {
    return this.request<ReviewRecord[]>('GET', `/pulls/${encodeURIComponent(pullRequestId)}/reviews`);
  }

  listConventions(repoId: string): Promise<ConventionCandidate[]> {
    return this.request<ConventionCandidate[]>('GET', `/repos/${encodeURIComponent(repoId)}/conventions`);
  }

  startReview(pullRequestId: string, agentId: string): Promise<ReviewRunResponse> {
    const body: RunRequest = { agentId };
    return this.request<ReviewRunResponse>('POST', `/pulls/${encodeURIComponent(pullRequestId)}/review`, body);
  }

  private async request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        // Only declare a JSON body when one is sent: Fastify rejects an empty body under application/json.
        ...(body !== undefined
          ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
          : {}),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (cause) {
      if (cause instanceof Error && cause.name === 'TimeoutError') {
        throw new DevDigestApiError(
          `The DevDigest API did not answer within ${Math.round(this.timeoutMs / 1000)} s`,
          0,
          'timeout',
        );
      }
      throw new DevDigestApiError(`Cannot reach the DevDigest API at ${this.baseUrl}`, 0, 'network_error');
    }

    if (!res.ok) {
      let message = `${res.status} ${res.statusText}`;
      let code: string | undefined;
      try {
        const envelope = (await res.json()) as Partial<ApiErrorBody> | null;
        if (envelope?.error) {
          message = envelope.error.message ?? message;
          code = envelope.error.code;
        }
      } catch {
        // Non-JSON error body: keep the status line.
      }
      throw new DevDigestApiError(message, res.status, code);
    }

    try {
      return (await res.json()) as T;
    } catch {
      throw new DevDigestApiError('The DevDigest API returned a response that is not valid JSON', 502, 'bad_response');
    }
  }
}
