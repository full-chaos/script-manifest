import type { FastifyBaseLogger } from "fastify";
import { getKafkaClient } from "@script-manifest/service-utils";
import {
  upsertCompetitionDocument,
  deleteCompetitionDocument,
  competitionToDocument,
  ensureCompetitionsCollection,
  upsertTalentDocument,
  deleteTalentDocument,
  talentToDocument,
  ensureTalentCollection,
  upsertProjectDocument,
  deleteProjectDocument,
  projectToDocument,
  ensureProjectsCollection,
} from "@script-manifest/search";
import { SearchSyncEventSchema, type SearchSyncEvent } from "@script-manifest/contracts";

async function ensureAllCollections(logger: FastifyBaseLogger): Promise<void> {
  const collections = [
    { name: "competitions", fn: ensureCompetitionsCollection },
    { name: "talent", fn: ensureTalentCollection },
    { name: "projects", fn: ensureProjectsCollection },
  ];
  for (const { name, fn } of collections) {
    try {
      await fn();
      logger.info(`Typesense ${name} collection ready`);
    } catch (err) {
      logger.error({ err }, `Failed to ensure Typesense ${name} collection`);
    }
  }
}

function handleCompetitionUpsert(payload: Record<string, unknown>): void | Promise<void> {
  const p = payload;
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
  return upsertCompetitionDocument(doc);
}

function handleTalentUpsert(payload: Record<string, unknown>): void | Promise<void> {
  const p = payload;
  const doc = talentToDocument({
    writerId: String(p.writerId ?? ""),
    projectId: String(p.projectId ?? ""),
    displayName: String(p.displayName ?? ""),
    representationStatus: String(p.representationStatus ?? "unrepresented"),
    genres: Array.isArray(p.genres) ? p.genres.map(String) : [],
    demographics: Array.isArray(p.demographics) ? p.demographics.map(String) : [],
    projectTitle: String(p.projectTitle ?? ""),
    projectFormat: String(p.projectFormat ?? ""),
    projectGenre: String(p.projectGenre ?? ""),
    logline: String(p.logline ?? ""),
    synopsis: String(p.synopsis ?? ""),
    isSearchable: Boolean(p.isSearchable ?? true),
    updatedAt: typeof p.updatedAt === "string" ? p.updatedAt : undefined,
  });
  return upsertTalentDocument(doc);
}

function handleProjectUpsert(payload: Record<string, unknown>): void | Promise<void> {
  const p = payload;
  const doc = projectToDocument({
    id: String(p.id ?? ""),
    ownerUserId: String(p.ownerUserId ?? ""),
    title: String(p.title ?? ""),
    logline: String(p.logline ?? ""),
    synopsis: String(p.synopsis ?? ""),
    format: String(p.format ?? ""),
    genre: String(p.genre ?? ""),
    pageCount: Number(p.pageCount ?? 0),
    isDiscoverable: Boolean(p.isDiscoverable ?? false),
    createdAt: typeof p.createdAt === "string" ? p.createdAt : new Date().toISOString(),
    updatedAt: typeof p.updatedAt === "string" ? p.updatedAt : new Date().toISOString(),
  });
  return upsertProjectDocument(doc);
}

async function processEvent(event: SearchSyncEvent, logger: FastifyBaseLogger): Promise<void> {
  if (event.operation === "delete") {
    if (event.collection === "competitions") await deleteCompetitionDocument(event.documentId);
    else if (event.collection === "talent") await deleteTalentDocument(event.documentId);
    else if (event.collection === "projects") await deleteProjectDocument(event.documentId);
    logger.debug({ collection: event.collection, id: event.documentId }, "deleted from Typesense");
    return;
  }

  if (!event.payload) return;
  const payload = event.payload as Record<string, unknown>;

  if (payload.type === "profile_update") {
    logger.debug({ writerId: payload.writerId }, "profile_update event — skipping direct index (handled by talent rebuild)");
    return;
  }

  if (event.collection === "competitions") await handleCompetitionUpsert(payload);
  else if (event.collection === "talent") await handleTalentUpsert(payload);
  else if (event.collection === "projects") await handleProjectUpsert(payload);

  logger.debug({ collection: event.collection, id: event.documentId }, "upserted to Typesense");
}

export async function startConsumer(logger: FastifyBaseLogger): Promise<() => Promise<void>> {
  const kafka = getKafkaClient();
  if (!kafka) {
    logger.warn("KAFKA_BROKERS not set — search sync consumer disabled");
    return async () => {};
  }

  await ensureAllCollections(logger);

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
          await processEvent(event, logger);
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
