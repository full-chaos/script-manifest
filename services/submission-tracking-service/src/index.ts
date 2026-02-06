import Fastify from "fastify";
import { randomUUID } from "node:crypto";
import {
  PlacementCreateRequestSchema,
  PlacementSchema,
  PlacementVerificationUpdateRequestSchema,
  SubmissionCreateRequestSchema,
  SubmissionFiltersSchema,
  SubmissionSchema,
  type Placement,
  type Submission
} from "@script-manifest/contracts";

const server = Fastify({ logger: true });
const port = Number(process.env.PORT ?? 4004);

const submissions = new Map<string, Submission>();
const placements = new Map<string, Placement>();

server.get("/health", async () => ({
  service: "submission-tracking-service",
  ok: true,
  submissions: submissions.size,
  placements: placements.size
}));

server.post("/internal/submissions", async (req, reply) => {
  const parsedBody = SubmissionCreateRequestSchema.safeParse(req.body);
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

server.listen({ port, host: "0.0.0.0" }).catch((error) => {
  server.log.error(error);
  process.exit(1);
});
