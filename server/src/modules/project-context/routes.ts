import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { AttachmentPath } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';

const DocContentQuery = z.object({ path: AttachmentPath });

/**
 * Project context — read-only browsing of a repo's Markdown docs.
 *   GET /repos/:id/context/docs                → ProjectContextList
 *   GET /repos/:id/context/docs/content?path=  → ProjectContextDocContent
 * Transport only; the service reads git objects of the synced mirror.
 */
export default async function projectContextRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();

  app.get('/repos/:id/context/docs', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return app.container.projectContext.listDocs(workspaceId, req.params.id);
  });

  app.get(
    '/repos/:id/context/docs/content',
    { schema: { params: IdParams, querystring: DocContentQuery } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return app.container.projectContext.readDoc(workspaceId, req.params.id, req.query.path);
    },
  );
}
