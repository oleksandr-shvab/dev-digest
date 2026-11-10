import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { PrBriefState } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { BriefService } from './service.js';

/**
 * PR brief module (plans/pr-brief.md).
 *   GET  /pulls/:id/brief  → PrBriefState (stored brief + generation status; no LLM call)
 *   POST /pulls/:id/brief  → 202, fire-and-forget; PrBriefState with generating: true
 *                            (404 other workspace · 409 no_changed_files / already running · 429 over 10/min)
 */

export default async function briefRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  // One service per app: its in-memory registry is shared by every request.
  const service = new BriefService(container);

  app.get(
    '/pulls/:id/brief',
    { schema: { params: IdParams, response: { 200: PrBriefState } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.getState(workspaceId, req.params.id);
    },
  );

  app.post(
    '/pulls/:id/brief',
    { schema: { params: IdParams }, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const { workspaceId } = await getContext(container, req);
      const state = await service.startGeneration(workspaceId, req.params.id, req.log);
      reply.status(202);
      return state;
    },
  );
}
