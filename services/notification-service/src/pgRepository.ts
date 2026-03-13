import { randomUUID } from "node:crypto";
import { getPool, runMigrations } from "@script-manifest/db";
import type { NotificationEventEnvelope } from "@script-manifest/contracts";
import type { NotificationRepository } from "./repository.js";

type NotificationEventRow = {
  id: string;
  event_id: string;
  event_type: NotificationEventEnvelope["eventType"];
  occurred_at: Date;
  actor_user_id: string | null;
  target_user_id: string;
  resource_type: NotificationEventEnvelope["resourceType"];
  resource_id: string;
  payload: NotificationEventEnvelope["payload"];
  created_at: Date;
};

function mapEvent(row: NotificationEventRow): NotificationEventEnvelope {
  return {
    eventId: row.event_id,
    eventType: row.event_type,
    occurredAt: row.occurred_at.toISOString(),
    actorUserId: row.actor_user_id ?? undefined,
    targetUserId: row.target_user_id,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    payload: row.payload,
  };
}

export class PgNotificationRepository implements NotificationRepository {
  async init(): Promise<void> {
    await runMigrations(getPool());
  }

  async healthCheck(): Promise<{ database: boolean }> {
    try {
      await getPool().query("SELECT 1");
      return { database: true };
    } catch {
      return { database: false };
    }
  }

  async pushEvent(event: NotificationEventEnvelope): Promise<void> {
    await getPool().query(
      `INSERT INTO notification_events (
        id,
        event_id,
        event_type,
        occurred_at,
        actor_user_id,
        target_user_id,
        resource_type,
        resource_id,
        payload
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        randomUUID(),
        event.eventId,
        event.eventType,
        event.occurredAt,
        event.actorUserId ?? null,
        event.targetUserId,
        event.resourceType,
        event.resourceId,
        event.payload,
      ]
    );
  }

  async getEventsByTargetUser(targetUserId: string, limit = 100, offset = 0): Promise<NotificationEventEnvelope[]> {
    const result = await getPool().query<NotificationEventRow>(
      `SELECT *
       FROM notification_events
       WHERE target_user_id = $1
       ORDER BY occurred_at ASC
       LIMIT $2 OFFSET $3`,
      [targetUserId, limit, offset]
    );

    return result.rows.map(mapEvent);
  }
}
