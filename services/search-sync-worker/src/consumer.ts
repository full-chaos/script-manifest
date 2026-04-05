import type { FastifyBaseLogger } from "fastify";
import { getKafkaClient } from "@script-manifest/service-utils";
import {
  upsertCompetitionDocument,
  deleteCompetitionDocument,
  competitionToDocument,
  ensureCompetitionsCollection,
} from "@script-manifest/search";
import { SearchSyncEventSchema, type SearchSyncEvent } from "@script-manifest/contracts";

export async function startConsumer(logger: FastifyBaseLogger): Promise<() => Promise<void>> {
  const kafka = getKafkaClient();
  if (!kafka) {
    logger.warn("KAFKA_BROKERS not set — search sync consumer disabled");
    return async () => {};
  }

  try {
    await ensureCompetitionsCollection();
    logger.info("Typesense competitions collection ready");
  } catch (err) {
    logger.error({ err }, "Failed to ensure Typesense collections — will retry on first message");
  }

  const consumer = kafka.consumer({ groupId: "search-sync-worker" });
  try {
    await consumer.connect();
    await consumer.subscribe({ topic: "search-sync-events", fromBeginning: false });
    await consumer.run({
      eachMessage: async ({ message }) => {
        let event: SearchSyncEvent;
        try {
          const raw = JSON.parse(message.value!.toString());
          event = SearchSyncEventSchema.parse(raw);
        } catch (err) {
          logger.error({ err, offset: message.offset }, "malformed search sync event, skipping");
          return;
        }

        try {
          if (event.operation === "delete") {
            if (event.collection === "competitions") {
              await deleteCompetitionDocument(event.documentId);
            }
            logger.debug({ collection: event.collection, id: event.documentId }, "deleted from Typesense");
          } else {
            if (event.collection === "competitions" && event.payload) {
              const p = event.payload as Record<string, unknown>;
              const doc = competitionToDocument(
                {
                  id: String(p.id ?? ""),
                  title: String(p.title ?? ""),
                  description: String(p.description ?? ""),
                  format: String(p.format ?? ""),
                  genre: String(p.genre ?? ""),
                  feeUsd: Number(p.feeUsd ?? 0),
                  deadline: String(p.deadline ?? ""),
                  status: String(p.status ?? "active") as "active" | "cancelled",
                  visibility: String(p.visibility ?? "listed") as "listed" | "unlisted",
                  accessType: String(p.accessType ?? "open") as "open" | "invite_only",
                },
                {
                  createdAt: typeof p.createdAt === "string" ? p.createdAt : undefined,
                  updatedAt: typeof p.updatedAt === "string" ? p.updatedAt : undefined,
                },
              );
              await upsertCompetitionDocument(doc);
            }
            logger.debug({ collection: event.collection, id: event.documentId }, "upserted to Typesense");
          }
        } catch (err) {
          logger.error({ err, event }, "Typesense sync failed");
          throw err;
        }
      },
    });
    logger.info("search-sync-worker consumer started");
  } catch (err) {
    logger.warn({ err }, "Kafka consumer failed to start");
    return async () => {};
  }

  return async () => {
    await consumer.disconnect();
  };
}
