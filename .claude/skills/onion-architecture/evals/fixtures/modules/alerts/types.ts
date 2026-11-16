export type AlertChannel = 'slack' | 'email';
export type AlertSeverity = 'info' | 'warning' | 'critical';

export interface AlertRule {
  id: string;
  workspaceId: string;
  channel: AlertChannel;
  minSeverity: AlertSeverity;
  target: string;
  muted: boolean;
}

export interface AlertCandidate {
  prId: string;
  prTitle: string;
  severity: AlertSeverity;
  findingCount: number;
  agentName: string;
}

export interface AlertMessage {
  channel: AlertChannel;
  target: string;
  text: string;
  dedupeKey: string;
}

export interface DeliveryReport {
  sent: number;
  skipped: number;
  failed: { target: string; reason: string }[];
}
