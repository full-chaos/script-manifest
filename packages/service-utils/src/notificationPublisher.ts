import {
  NotificationEventEnvelope,
  NotificationEventEnvelopeSchema
} from "@script-manifest/contracts";
import type { Producer } from "kafkajs";
import { request } from "undici";
import { getKafkaClient } from "./kafka.js";

const notificationServiceBase = process.env.NOTIFICATION_SERVICE_URL ?? "http://localhost:4010";
let producer: Producer | null = null;

async function getProducer(): Promise<Producer | null> {
  const kafka = getKafkaClient();
  if (!kafka) return null;

  if (!producer) {
    producer = kafka.producer();
    await producer.connect();
  }

  return producer;
}

export async function publishNotificationEvent(event: NotificationEventEnvelope): Promise<void> {
  const validatedEvent = NotificationEventEnvelopeSchema.parse(event);
  const kafkaProducer = await getProducer();

  if (kafkaProducer) {
    await kafkaProducer.send({
      topic: "notification-events",
      messages: [{ key: validatedEvent.targetUserId, value: JSON.stringify(validatedEvent) }]
    });
    return;
  }

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

export async function disconnectProducer(): Promise<void> {
  if (producer) {
    await producer.disconnect();
    producer = null;
  }
}
