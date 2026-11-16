import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { getContext } from '../_shared/context.js';
import { DigestService } from './service.js';

const WeeklyQuery = z.object({ weekStart: z.coerce.date().optional() });

export default async function digestRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new DigestService(container);

  app.get('/digest/weekly', { schema: { querystring: WeeklyQuery } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.weekly(workspaceId, req.query.weekStart);
  });

  app.post('/digest/weekly/snapshot', async (req) => {
    const { workspaceId } = await getContext(container, req);
    const digest = await service.weekly(workspaceId);
    return service.saveSnapshot(workspaceId, digest);
  });
}
