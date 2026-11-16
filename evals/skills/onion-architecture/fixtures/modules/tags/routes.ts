import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import * as t from '../../db/schema.js';
import { getContext } from '../_shared/context.js';
import { TagService } from './service.js';

const IdParams = z.object({ id: z.string().uuid() });
const CreateTagBody = z.object({
  name: z.string().min(1).max(40),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
});

/**
 * Tags module.
 *   GET    /tags                         → list workspace tags
 *   POST   /tags                         → create a tag
 *   POST   /pulls/:id/tags/sync-labels   → import GitHub labels as tags
 *   DELETE /tags/:id                     → delete a tag
 */
export default async function tagsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new TagService(container);

  app.get('/tags', async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.list(workspaceId);
  });

  app.post('/tags', { schema: { body: CreateTagBody } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.create(workspaceId, req.body);
  });

  app.post('/pulls/:id/tags/sync-labels', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.syncLabelsFromGitHub(workspaceId, req.params.id);
  });

  app.delete('/tags/:id', { schema: { params: IdParams } }, async (req, reply) => {
    const { workspaceId } = await getContext(container, req);
    const [tag] = await container.db
      .select()
      .from(t.tags)
      .where(and(eq(t.tags.id, req.params.id), eq(t.tags.workspaceId, workspaceId)));
    if (!tag) return reply.code(404).send({ error: 'not_found' });

    const usage = await container.db
      .select({ prId: t.pullTags.prId })
      .from(t.pullTags)
      .where(eq(t.pullTags.tagId, tag.id));
    if (tag.system && usage.length > 0) {
      return reply.code(409).send({ error: 'tag_in_use', count: usage.length });
    }

    await container.db.delete(t.pullTags).where(eq(t.pullTags.tagId, tag.id));
    await container.db.delete(t.tags).where(eq(t.tags.id, tag.id));
    return reply.code(204).send();
  });
}
