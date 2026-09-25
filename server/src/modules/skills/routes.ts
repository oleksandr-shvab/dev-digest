import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { SkillInput } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError, ValidationError } from '../../platform/errors.js';
import { MAX_UPLOAD_BYTES, MULTIPART_OVERHEAD_BYTES } from './constants.js';
import { extractUploadedFile } from './import/multipart.js';
import { SkillsService } from './service.js';

/**
 * Skills module.
 *   GET    /skills                                → workspace skills + stats summary
 *   POST   /skills                                → create (writes v1)
 *   GET    /skills/:id                            → one skill + stats summary
 *   PUT    /skills/:id                            → partial update (+ optional message)
 *   DELETE /skills/:id                            → delete (links cascade)
 *   GET    /skills/:id/versions                   → snapshots, newest first
 *   GET    /skills/:id/versions/:version          → one snapshot
 *   POST   /skills/:id/versions/:version/restore  → restore as a NEW version
 *   GET    /skills/:id/stats                      → SkillStats (30-day window)
 *   POST   /skills/import/preview                 → multipart .md/.zip → SkillImportDraft (no DB write)
 */

const VersionParams = z.object({
  id: z.string().uuid(),
  version: z.coerce.number().int().positive(),
});

/** PUT accepts any subset of the create fields (+ `message`). */
const UpdateSkillBody = SkillInput.partial();

export default async function skillsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new SkillsService(app.container);

  // Upload bodies arrive as a raw buffer (parsed by `extractUploadedFile`),
  // scoped to this plugin so no other module is affected.
  app.addContentTypeParser(
    'multipart/form-data',
    { parseAs: 'buffer' },
    (_req, body, done) => done(null, body),
  );

  app.get('/skills', async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId);
  });

  app.post('/skills', { schema: { body: SkillInput } }, async (req, reply) => {
    const { workspaceId } = await getContext(app.container, req);
    const skill = await service.create(workspaceId, req.body);
    reply.status(201);
    return skill;
  });

  // Registered before `/skills/:id` routes for readability; the static segment
  // wins over the param either way.
  app.post(
    '/skills/import/preview',
    { bodyLimit: MAX_UPLOAD_BYTES + MULTIPART_OVERHEAD_BYTES },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      if (!Buffer.isBuffer(req.body)) throw new ValidationError('Expected a multipart/form-data upload');
      const file = extractUploadedFile(req.headers['content-type'], req.body);
      return service.previewImport(workspaceId, file.filename, file.data);
    },
  );

  app.get('/skills/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const skill = await service.get(workspaceId, req.params.id);
    if (!skill) throw new NotFoundError('Skill not found');
    return skill;
  });

  app.put(
    '/skills/:id',
    { schema: { params: IdParams, body: UpdateSkillBody } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const skill = await service.update(workspaceId, req.params.id, req.body);
      if (!skill) throw new NotFoundError('Skill not found');
      return skill;
    },
  );

  app.delete('/skills/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const ok = await service.delete(workspaceId, req.params.id);
    if (!ok) throw new NotFoundError('Skill not found');
    return { ok: true };
  });

  app.get('/skills/:id/versions', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const versions = await service.listVersions(workspaceId, req.params.id);
    if (!versions) throw new NotFoundError('Skill not found');
    return versions;
  });

  app.get('/skills/:id/versions/:version', { schema: { params: VersionParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const version = await service.getVersion(workspaceId, req.params.id, req.params.version);
    if (!version) throw new NotFoundError('Skill version not found');
    return version;
  });

  app.post(
    '/skills/:id/versions/:version/restore',
    { schema: { params: VersionParams } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const skill = await service.restoreVersion(workspaceId, req.params.id, req.params.version);
      if (!skill) throw new NotFoundError('Skill version not found');
      return skill;
    },
  );

  app.get('/skills/:id/stats', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const stats = await service.stats(workspaceId, req.params.id);
    if (!stats) throw new NotFoundError('Skill not found');
    return stats;
  });
}
