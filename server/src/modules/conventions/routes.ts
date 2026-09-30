import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { ConventionPatch, CreateConventionSkill } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { ConventionsService } from './service.js';

/**
 * Conventions module (server/specs/conventions.md).
 *   POST  /repos/:id/conventions/extract       → sample → LLM → verify → store; ConventionScanResult
 *   GET   /repos/:id/conventions                → pending + accepted, confidence desc
 *   PATCH /conventions/:id                       → accept/reject/edit one candidate
 *   POST  /repos/:id/conventions/skill-draft    → draft body from accepted candidates; no write
 *   POST  /repos/:id/conventions/skill          → save (or re-version) the `repo-conventions` skill
 */

const SkillDraftBody = z.object({ candidate_ids: z.array(z.string()).min(1) });

export default async function conventionsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new ConventionsService(container);

  app.post('/repos/:id/conventions/extract', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    const result = await service.extract(workspaceId, req.params.id);
    const dropCounts = result.dropped.reduce<Record<string, number>>((acc, d) => {
      acc[d.reason] = (acc[d.reason] ?? 0) + 1;
      return acc;
    }, {});
    app.log.info(
      { repoId: req.params.id, model: result.model, samples: result.samples.length, kept: result.candidates.length, dropped: dropCounts },
      'Conventions scan complete',
    );
    return result;
  });

  app.get('/repos/:id/conventions', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    const candidates = await service.list(workspaceId, req.params.id);
    if (!candidates) throw new NotFoundError('Repo not found');
    return candidates;
  });

  app.patch(
    '/conventions/:id',
    { schema: { params: IdParams, body: ConventionPatch } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      const candidate = await service.patch(workspaceId, req.params.id, req.body);
      if (!candidate) throw new NotFoundError('Convention not found');
      return candidate;
    },
  );

  app.post(
    '/repos/:id/conventions/skill-draft',
    { schema: { params: IdParams, body: SkillDraftBody } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      const draft = await service.skillDraft(workspaceId, req.params.id, req.body.candidate_ids);
      if (!draft) throw new NotFoundError('Repo not found');
      return draft;
    },
  );

  app.post(
    '/repos/:id/conventions/skill',
    { schema: { params: IdParams, body: CreateConventionSkill } },
    async (req, reply) => {
      const { workspaceId } = await getContext(container, req);
      const result = await service.createSkill(workspaceId, req.params.id, req.body);
      if (!result) throw new NotFoundError('Repo not found');
      reply.status(result.created ? 201 : 200);
      return result.skill;
    },
  );
}
