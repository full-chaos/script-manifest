import type { NotificationEventEnvelope } from "@script-manifest/contracts";

export interface NotificationRepository {
  init(): Promise<void>;
  healthCheck(): Promise<{ database: boolean }>;

  pushEvent(event: NotificationEventEnvelope): Promise<void>;
  getEventsByTargetUser(targetUserId: string): Promise<NotificationEventEnvelope[]>;
}
