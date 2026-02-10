import Fastify, { type FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import {
  PlacementFiltersSchema,
  PlacementListItemSchema,
  PlacementCreateRequestSchema,
  PlacementSchema,
  PlacementVerificationUpdateRequestSchema,
  SubmissionCreateInternalSchema,
  SubmissionFiltersSchema,
  SubmissionProjectReassignmentRequestSchema,
  SubmissionSchema,
  type Placement,
  type PlacementListItem,
  type Submission
} from "@script-manifest/contracts";

export type SubmissionTrackingOptions = {
  logger?: boolean;
};

export function buildServer(options: SubmissionTrackingOptions = {}): FastifyInstance {
  const server = Fastify({ logger: options.logger ?? true });
  const submissions = new Map<string, Submission>();
  const placements = new Map<string, Placement>();

  const getAuthUserId = (headers: Record<string, unknown>): string | null => {
    const userId = headers["x-auth-user-id"];
    return typeof userId === "string" && userId.length > 0 ? userId : null;
  };

  server.get("/health", async () => ({
    service: "submission-tracking-service",
    ok: true,
    submissions: submissions.size,
    placements: placements.size
  }));

  server.post("/internal/submissions", async (req, reply) => {
    const authUserId = getAuthUserId(req.headers);
    if (!authUserId) {
      return reply.status(403).send({ error: "forbidden" });
    }

    const parsedBody = SubmissionCreateInternalSchema.safeParse({
      ...(req.body as object),
      writerId: authUserId
    });
    if (!parsedBody.success) {
      return reply.status(400).send({
        error: "invalid_payload",
        details: parsedBody.error.flatten()
      });
    }

    const now = new Date().toISOString();
    const submission = SubmissionSchema.parse({
      id: `submission_${randomUUID()}`,
      ...parsedBody.data,
      createdAt: now,
      updatedAt: now
    });
    submissions.set(submission.id, submission);

    return reply.status(201).send({ submission });
  });

  server.patch("/internal/submissions/:submissionId/project", async (req, reply) => {
    const { submissionId } = req.params as { submissionId: string };
    const authUserId = getAuthUserId(req.headers);
    if (!authUserId) {
      return reply.status(403).send({ error: "forbidden" });
    }

    const submission = submissions.get(submissionId);
    if (!submission) {
      return reply.status(404).send({ error: "submission_not_found" });
    }

    if (submission.writerId !== authUserId) {
      return reply.status(403).send({ error: "forbidden" });
    }

    const parsedBody = SubmissionProjectReassignmentRequestSchema.safeParse(req.body);
    if (!parsedBody.success) {
      return reply.status(400).send({
        error: "invalid_payload",
        details: parsedBody.error.flatten()
      });
    }

    const updatedSubmission = SubmissionSchema.parse({
      ...submission,
      projectId: parsedBody.data.projectId,
      updatedAt: new Date().toISOString()
    });
    submissions.set(submissionId, updatedSubmission);

    return reply.send({ submission: updatedSubmission });
  });

  server.get("/internal/submissions", async (req, reply) => {
    const parsedQuery = SubmissionFiltersSchema.safeParse(req.query);
    if (!parsedQuery.success) {
      return reply.status(400).send({
        error: "invalid_query",
        details: parsedQuery.error.flatten()
      });
    }

    const filters = parsedQuery.data;
    const filteredSubmissions = Array.from(submissions.values()).filter((submission) => {
      if (filters.writerId && submission.writerId !== filters.writerId) {
        return false;
      }

      if (filters.projectId && submission.projectId !== filters.projectId) {
        return false;
      }

      if (filters.competitionId && submission.competitionId !== filters.competitionId) {
        return false;
      }

      if (filters.status && submission.status !== filters.status) {
        return false;
      }

      return true;
    });

    return reply.send({ submissions: filteredSubmissions });
  });

  server.post("/internal/submissions/:submissionId/placements", async (req, reply) => {
    const { submissionId } = req.params as { submissionId: string };
    const submission = submissions.get(submissionId);
    if (!submission) {
      return reply.status(404).send({ error: "submission_not_found" });
    }

    const parsedBody = PlacementCreateRequestSchema.safeParse(req.body);
    if (!parsedBody.success) {
      return reply.status(400).send({
        error: "invalid_payload",
        details: parsedBody.error.flatten()
      });
    }

    const now = new Date().toISOString();
    const placement = PlacementSchema.parse({
      id: `placement_${randomUUID()}`,
      submissionId,
      status: parsedBody.data.status,
      verificationState: "pending",
      createdAt: now,
      updatedAt: now,
      verifiedAt: null
    });
    placements.set(placement.id, placement);

    const updatedSubmission = SubmissionSchema.parse({
      ...submission,
      status: placement.status,
      updatedAt: now
    });
    submissions.set(updatedSubmission.id, updatedSubmission);

    return reply.status(201).send({ placement, submission: updatedSubmission });
  });

  server.get("/internal/submissions/:submissionId/placements", async (req, reply) => {
    const { submissionId } = req.params as { submissionId: string };
    const submission = submissions.get(submissionId);
    if (!submission) {
      return reply.status(404).send({ error: "submission_not_found" });
    }

    const authUserId = getAuthUserId(req.headers);
    if (authUserId && authUserId !== submission.writerId) {
      return reply.status(403).send({ error: "forbidden" });
    }

    const items = Array.from(placements.values())
      .filter((placement) => placement.submissionId === submissionId)
      .map((placement) => toPlacementListItem(placement, submission));

    return reply.send({ placements: items });
  });

  server.get("/internal/placements", async (req, reply) => {
    const parsedQuery = PlacementFiltersSchema.safeParse(req.query);
    if (!parsedQuery.success) {
      return reply.status(400).send({
        error: "invalid_query",
        details: parsedQuery.error.flatten()
      });
    }

    const authUserId = getAuthUserId(req.headers);
    const filters = parsedQuery.data;
    if (authUserId && filters.writerId && filters.writerId !== authUserId) {
      return reply.status(403).send({ error: "forbidden" });
    }

    const filteredPlacements = Array.from(placements.values()).flatMap((placement) => {
      const submission = submissions.get(placement.submissionId);
      if (!submission) {
        return [];
      }

      if (authUserId && submission.writerId !== authUserId) {
        return [];
      }

      if (filters.submissionId && placement.submissionId !== filters.submissionId) {
        return [];
      }
      if (filters.writerId && submission.writerId !== filters.writerId) {
        return [];
      }
      if (filters.projectId && submission.projectId !== filters.projectId) {
        return [];
      }
      if (filters.competitionId && submission.competitionId !== filters.competitionId) {
        return [];
      }
      if (filters.status && placement.status !== filters.status) {
        return [];
      }
      if (filters.verificationState && placement.verificationState !== filters.verificationState) {
        return [];
      }

      return [toPlacementListItem(placement, submission)];
    });

    return reply.send({ placements: filteredPlacements });
  });

  server.get("/internal/placements/:placementId", async (req, reply) => {
    const { placementId } = req.params as { placementId: string };
    const placement = placements.get(placementId);
    if (!placement) {
      return reply.status(404).send({ error: "placement_not_found" });
    }

    const submission = submissions.get(placement.submissionId);
    if (!submission) {
      return reply.status(404).send({ error: "submission_not_found" });
    }

    const authUserId = getAuthUserId(req.headers);
    if (authUserId && authUserId !== submission.writerId) {
      return reply.status(403).send({ error: "forbidden" });
    }

    return reply.send({ placement: toPlacementListItem(placement, submission) });
  });

  server.post("/internal/placements/:placementId/verify", async (req, reply) => {
    const { placementId } = req.params as { placementId: string };
    const placement = placements.get(placementId);
    if (!placement) {
      return reply.status(404).send({ error: "placement_not_found" });
    }

    const parsedBody = PlacementVerificationUpdateRequestSchema.safeParse(req.body);
    if (!parsedBody.success) {
      return reply.status(400).send({
        error: "invalid_payload",
        details: parsedBody.error.flatten()
      });
    }

    const now = new Date().toISOString();
    const updatedPlacement = PlacementSchema.parse({
      ...placement,
      verificationState: parsedBody.data.verificationState,
      updatedAt: now,
      verifiedAt: parsedBody.data.verificationState === "verified" ? now : null
    });
    placements.set(updatedPlacement.id, updatedPlacement);

    return reply.send({ placement: updatedPlacement });
  });

  return server;
}

function toPlacementListItem(placement: Placement, submission: Submission): PlacementListItem {
  return PlacementListItemSchema.parse({
    ...placement,
    writerId: submission.writerId,
    projectId: submission.projectId,
    competitionId: submission.competitionId
  });
}

export async function startServer(): Promise<void> {
  const port = Number(process.env.PORT ?? 4004);
  const server = buildServer();
  await server.listen({ port, host: "0.0.0.0" });
}

function isMainModule(metaUrl: string): boolean {
  if (!process.argv[1]) {
    return false;
  }

  return metaUrl === pathToFileURL(process.argv[1]).href;
}

if (isMainModule(import.meta.url)) {
  startServer().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
