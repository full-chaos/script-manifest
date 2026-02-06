import Fastify from "fastify";
import { randomUUID } from "node:crypto";
import { request } from "undici";
import {
  CompetitionFiltersSchema,
  CompetitionSchema,
  CompetitionUpsertRequestSchema,
  NotificationEventEnvelopeSchema,
  type Competition
} from "@script-manifest/contracts";
import { z } from "zod";

const server = Fastify({ logger: true });
const port = Number(process.env.PORT ?? 4002);
const searchIndexerBase = process.env.SEARCH_INDEXER_URL ?? "http://localhost:4003";
const notificationServiceBase = process.env.NOTIFICATION_SERVICE_URL ?? "http://localhost:4010";

const seedCompetition = CompetitionSchema.parse({
  id: "comp_001",
  title: "Screenplay Sprint",
  description: "Seed competition record for local development",
  format: "feature",
  genre: "drama",
  feeUsd: 25,
  deadline: "2026-05-01T23:59:59Z"
});

const competitions = new Map<string, Competition>([[seedCompetition.id, seedCompetition]]);

server.get("/health", async () => ({
  service: "competition-directory-service",
  ok: true,
  count: competitions.size
}));

server.get("/internal/competitions", async (req, reply) => {
  const parsedFilters = CompetitionFiltersSchema.safeParse(req.query);
  if (!parsedFilters.success) {
    return reply.status(400).send({
      error: "invalid_query",
      details: parsedFilters.error.flatten()
    });
  }

  const filters = parsedFilters.data;
  const loweredQuery = filters.query?.toLowerCase();
  const results = Array.from(competitions.values()).filter((competition) => {
    if (
      loweredQuery &&
      !`${competition.title} ${competition.description}`.toLowerCase().includes(loweredQuery)
    ) {
      return false;
    }

    if (filters.format && competition.format.toLowerCase() !== filters.format.toLowerCase()) {
      return false;
    }

    if (filters.genre && competition.genre.toLowerCase() !== filters.genre.toLowerCase()) {
      return false;
    }

    if (typeof filters.maxFeeUsd === "number" && competition.feeUsd > filters.maxFeeUsd) {
      return false;
    }

    if (filters.deadlineBefore && new Date(competition.deadline) >= filters.deadlineBefore) {
      return false;
    }

    return true;
  });

  return reply.send({ competitions: results });
});

server.post("/internal/competitions", async (req, reply) => {
  const parsedBody = CompetitionUpsertRequestSchema.safeParse(req.body);
  if (!parsedBody.success) {
    return reply.status(400).send({
      error: "invalid_payload",
      details: parsedBody.error.flatten()
    });
  }

  const competition = parsedBody.data;
  const existed = competitions.has(competition.id);
  competitions.set(competition.id, competition);

  const indexing = await pushCompetitionToIndexer(competition);
  if (!indexing.ok) {
    server.log.warn({ competitionId: competition.id }, "competition saved but indexing failed");
  }

  return reply.status(existed ? 200 : 201).send({
    competition,
    upserted: true,
    created: !existed,
    indexed: indexing.ok
  });
});

server.post("/internal/competitions/reindex", async (_req, reply) => {
  const allCompetitions = Array.from(competitions.values());

  try {
    const upstream = await request(`${searchIndexerBase}/internal/index/competition/bulk`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(allCompetitions)
    });

    const upstreamBody = await readBody(upstream);
    return reply.status(upstream.statusCode).send({
      pushed: allCompetitions.length,
      indexer: upstreamBody
    });
  } catch (error) {
    server.log.error(error);
    return reply.status(502).send({ error: "reindex_failed" });
  }
});

const DeadlineReminderRequestSchema = z.object({
  targetUserId: z.string().min(1),
  actorUserId: z.string().min(1).optional(),
  deadlineAt: z.string().datetime({ offset: true }),
  message: z.string().max(500).optional()
});

server.post("/internal/competitions/:competitionId/deadline-reminders", async (req, reply) => {
  const { competitionId } = req.params as { competitionId: string };
  const parsedBody = DeadlineReminderRequestSchema.safeParse(req.body);
  if (!parsedBody.success) {
    return reply.status(400).send({
      error: "invalid_payload",
      details: parsedBody.error.flatten()
    });
  }

  const event = NotificationEventEnvelopeSchema.parse({
    eventId: randomUUID(),
    eventType: "deadline_reminder",
    occurredAt: new Date().toISOString(),
    actorUserId: parsedBody.data.actorUserId,
    targetUserId: parsedBody.data.targetUserId,
    resourceType: "competition",
    resourceId: competitionId,
    payload: {
      deadlineAt: parsedBody.data.deadlineAt,
      message: parsedBody.data.message ?? null
    }
  });

  try {
    const upstream = await request(`${notificationServiceBase}/internal/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(event)
    });

    if (upstream.statusCode >= 400) {
      const details = await readBody(upstream);
      return reply.status(502).send({ error: "notification_publish_failed", details });
    }

    return reply.status(202).send({ accepted: true, eventId: event.eventId });
  } catch {
    return reply.status(502).send({ error: "notification_publish_failed" });
  }
});

server.listen({ port, host: "0.0.0.0" }).catch((error) => {
  server.log.error(error);
  process.exit(1);
});

async function pushCompetitionToIndexer(
  competition: Competition
): Promise<{ ok: boolean; body?: unknown }> {
  try {
    const upstream = await request(`${searchIndexerBase}/internal/index/competition`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(competition)
    });
    const body = await readBody(upstream);
    return { ok: upstream.statusCode >= 200 && upstream.statusCode < 300, body };
  } catch {
    return { ok: false };
  }
}

async function readBody(upstream: Awaited<ReturnType<typeof request>>): Promise<unknown> {
  const raw = await upstream.body.text();
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}
