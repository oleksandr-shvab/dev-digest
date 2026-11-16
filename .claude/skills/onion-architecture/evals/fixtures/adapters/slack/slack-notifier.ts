import { WebClient, type ChatPostMessageResponse, type ConversationsListResponse } from '@slack/web-api';
import type { Notifier, NotifierMessage } from '@devdigest/shared';

export class SlackNotifier implements Notifier {
  readonly id = 'slack' as const;
  private client: WebClient;

  constructor(token: string) {
    this.client = new WebClient(token);
  }

  send(message: NotifierMessage): Promise<ChatPostMessageResponse> {
    return this.client.chat.postMessage({
      channel: message.channel,
      text: message.text,
      thread_ts: message.threadTs,
    });
  }

  listChannels(): Promise<ConversationsListResponse> {
    return this.client.conversations.list({ exclude_archived: true, limit: 200 });
  }
}
