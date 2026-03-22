import type { FastifyBaseLogger } from "fastify";
import { NotificationEventEnvelopeSchema } from "@script-manifest/contracts";
import { getKafkaClient } from "@script-manifest/service-utils";
import type { NotificationRepository } from "./repository.js";

export async function startConsumer(
  repository: NotificationRepository,
  logger: FastifyBaseLogger
): Promise<() => Promise<void>> {
  const kafka = getKafkaClient();
  if (!kafka) {
    logger.warn("KAFKA_BROKERS not set — Kafka consumer disabled");
    return async () => {};
  }

  const consumer = kafka.consumer({ groupId: "notification-service" });
  try {
    await consumer.connect();
    await consumer.subscribe({ topic: "notification-events", fromBeginning: false });
    await consumer.run({
      eachMessage: async ({ message }) => {
        let event;
        try {
          const raw = JSON.parse(message.value!.toString());
          event = NotificationEventEnvelopeSchema.parse(raw);
        } catch (err) {
          // Parse/schema errors are permanent — log and skip to avoid infinite retry
          logger.error({ err, offset: message.offset }, "malformed notification event, skipping");
          return;
        }
        // pushEvent errors (e.g. DB hiccup) propagate → KafkaJS retries from last committed offset
        await repository.pushEvent(event);
      },
    });
  } catch (err) {
    logger.warn({ err }, "Kafka consumer failed to start — falling back to HTTP-only mode");
    return async () => {};
  }

  return async () => {
    await consumer.disconnect();
  };
}
