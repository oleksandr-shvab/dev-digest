import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { BlastRadius } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { BlastService } from './service.js';

/**
 * blast module.
 *   GET /pulls/:id/blast → BlastRadius read from the repo-intel index (no LLM, no GitHub, no re-parse)
 */
export default async function blastRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new BlastService(container);

  // GET only reads the ready index: no model call, no index job.
  app.get(
    '/pulls/:id/blast',
    { schema: { params: IdParams, response: { 200: BlastRadius } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.blastRadius(workspaceId, req.params.id, req.log);
    },
  );
}
