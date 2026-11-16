import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { SlackNotifier } from '../../adapters/slack/slack-notifier.js';
import { getContext } from '../_shared/context.js';
import { SLACK_TOKEN_SECRET } from './constants.js';
import { AlertService } from './service.js';

const PrParams = z.object({ id: z.string().uuid() });
const TestSendBody = z.object({ channel: z.string().min(1).max(80) });

export default async function alertsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new AlertService(container);

  app.get('/alerts/rules', async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.listRules(workspaceId);
  });

  app.post('/pulls/:id/alerts', { schema: { params: PrParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.notifyForPull(workspaceId, req.params.id);
  });

  app.post('/alerts/test-send', { schema: { body: TestSendBody } }, async (req) => {
    await getContext(container, req);
    const token = await container.secrets.get(SLACK_TOKEN_SECRET);
    const notifier = new SlackNotifier(token ?? '');
    const res = await notifier.send({ channel: req.body.channel, text: 'DevDigest test message' });
    return { ok: res.ok };
  });
}
