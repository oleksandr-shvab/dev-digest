import type { ChatPostMessageResponse, ConversationsListResponse } from '@slack/web-api';

export interface NotifierMessage {
  channel: string;
  text: string;
  threadTs?: string;
}

export interface Notifier {
  readonly id: 'slack';
  send(message: NotifierMessage): Promise<ChatPostMessageResponse>;
  listChannels(): Promise<ConversationsListResponse>;
}
