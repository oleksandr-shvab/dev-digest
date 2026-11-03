import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { OnboardingService } from './service.js';

/**
 * Onboarding tour module (plans/onboarding-tour.md).
 *   GET  /repos/:id/onboarding           → OnboardingTourState (stored tour + status; no LLM call)
 *   POST /repos/:id/onboarding/generate  → 202, fire-and-forget; OnboardingTourState with generating: true
 */

export default async function onboardingRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  // One service per app: its in-memory registry is shared by every request.
  const service = new OnboardingService(container);

  app.get('/repos/:id/onboarding', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    const state = await service.getState(workspaceId, req.params.id);
    if (!state) throw new NotFoundError('Repo not found');
    return state;
  });

  app.post('/repos/:id/onboarding/generate', { schema: { params: IdParams } }, async (req, reply) => {
    const { workspaceId } = await getContext(container, req);
    const state = await service.startGeneration(workspaceId, req.params.id, req.log);
    reply.status(202);
    return state;
  });
}
