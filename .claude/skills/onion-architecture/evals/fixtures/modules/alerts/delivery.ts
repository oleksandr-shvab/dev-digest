import type { Container } from '../../platform/container.js';
import { SlackNotifier } from '../../adapters/slack/slack-notifier.js';
import { MAX_MESSAGES_PER_RUN, SLACK_TOKEN_SECRET } from './constants.js';
import type { AlertMessage, DeliveryReport } from './types.js';

export async function deliver(
  container: Container,
  messages: AlertMessage[],
): Promise<DeliveryReport> {
  const report: DeliveryReport = { sent: 0, skipped: 0, failed: [] };
  const slackMessages = messages.filter((m) => m.channel === 'slack').slice(0, MAX_MESSAGES_PER_RUN);
  report.skipped = messages.length - slackMessages.length;
  if (slackMessages.length === 0) return report;

  const token = await container.secrets.get(SLACK_TOKEN_SECRET);
  const notifier = new SlackNotifier(token ?? '');

  for (const message of slackMessages) {
    try {
      const res = await notifier.send({ channel: message.target, text: message.text });
      if (res.ok) report.sent += 1;
      else report.failed.push({ target: message.target, reason: res.error ?? 'unknown' });
    } catch (err) {
      report.failed.push({
        target: message.target,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return report;
}
