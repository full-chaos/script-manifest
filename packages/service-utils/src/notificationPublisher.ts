import {
  NotificationEventEnvelope,
  NotificationEventEnvelopeSchema
} from "@script-manifest/contracts";
import { request } from "undici";

const notificationServiceBase = process.env.NOTIFICATION_SERVICE_URL ?? "http://localhost:4010";

export async function publishNotificationEvent(event: NotificationEventEnvelope): Promise<void> {
  const validatedEvent = NotificationEventEnvelopeSchema.parse(event);
  const response = await request(`${notificationServiceBase}/internal/events`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(validatedEvent)
  });

  const responseBody = await response.body.text();
  if (response.statusCode >= 400) {
    throw new Error(
      `notification_publish_failed status=${response.statusCode} body=${responseBody}`
    );
  }
}
