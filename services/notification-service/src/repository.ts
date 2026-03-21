import type { NotificationEventEnvelope } from "@script-manifest/contracts";

export interface NotificationRepository {
  init(): Promise<void>;
  healthCheck(): Promise<{ database: boolean }>;

  pushEvent(event: NotificationEventEnvelope): Promise<void>;
  getEventsByTargetUser(targetUserId: string, limit?: number, offset?: number): Promise<NotificationEventEnvelope[]>;
  markEventRead(eventId: string, targetUserId: string): Promise<boolean>;
  getUnreadCount(targetUserId: string): Promise<number>;
}
