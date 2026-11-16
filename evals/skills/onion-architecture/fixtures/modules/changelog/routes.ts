import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { getContext } from '../_shared/context.js';
import { ChangelogService } from './service.js';

const PrParams = z.object({ id: z.string().uuid() });

export default async function changelogRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new ChangelogService(container);

  app.get('/pulls/:id/changelog', { schema: { params: PrParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.draftForPull(workspaceId, req.params.id);
  });

  app.post('/pulls/:id/changelog', { schema: { params: PrParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    const entry = await service.draftForPull(workspaceId, req.params.id);
    return service.publish(workspaceId, req.params.id, entry);
  });

  app.get('/changelog', async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.list(workspaceId);
  });
}
