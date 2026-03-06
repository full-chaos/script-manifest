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
  await consumer.connect();
  await consumer.subscribe({ topic: "notification-events", fromBeginning: false });
  await consumer.run({
    eachMessage: async ({ message }) => {
      try {
        const raw = JSON.parse(message.value!.toString());
        const event = NotificationEventEnvelopeSchema.parse(raw);
        await repository.pushEvent(event);
      } catch (err) {
        logger.error({ err, offset: message.offset }, "failed to process notification event from kafka");
      }
    },
  });

  return async () => {
    await consumer.disconnect();
  };
}
