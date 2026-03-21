import type { FastifyInstance } from "fastify";
import { OnboardingProgressUpdateSchema } from "@script-manifest/contracts";
import { readBearerToken } from "@script-manifest/service-utils";
import type { OnboardingRepository } from "./onboarding-repository.js";
import type { IdentityRepository } from "./repository.js";

const STEP_TO_COLUMN = {
  profileCompleted: "profile_completed",
  firstScriptUploaded: "first_script_uploaded",
  competitionsVisited: "competitions_visited",
  coverageVisited: "coverage_visited"
} as const;

export function registerOnboardingRoutes(
  server: FastifyInstance,
  onboardingRepo: OnboardingRepository,
  identityRepo: IdentityRepository
): void {
  server.get("/internal/onboarding/status", {
    handler: async (req, reply) => {
      const token = readBearerToken(req.headers.authorization);
      if (!token) {
        return reply.status(401).send({ error: "missing_bearer_token" });
      }

      const sessionData = await identityRepo.findUserBySessionToken(token);
      if (!sessionData) {
        return reply.status(401).send({ error: "invalid_session" });
      }

      const progress = await onboardingRepo.getProgress(sessionData.user.id);

      return reply.send({
        status: {
          emailVerified: sessionData.user.emailVerified,
          profileCompleted: progress.profileCompleted,
          firstScriptUploaded: progress.firstScriptUploaded,
          competitionsVisited: progress.competitionsVisited,
          coverageVisited: progress.coverageVisited
        }
      });
    }
  });

  server.patch("/internal/onboarding/progress", {
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
      const token = readBearerToken(req.headers.authorization);
      if (!token) {
        return reply.status(401).send({ error: "missing_bearer_token" });
      }

      const sessionData = await identityRepo.findUserBySessionToken(token);
      if (!sessionData) {
        return reply.status(401).send({ error: "invalid_session" });
      }

      const parsed = OnboardingProgressUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
      }

      for (const stepKey of Object.keys(STEP_TO_COLUMN) as Array<keyof typeof STEP_TO_COLUMN>) {
        if (parsed.data[stepKey]) {
          await onboardingRepo.markStepComplete(sessionData.user.id, STEP_TO_COLUMN[stepKey]);
        }
      }

      return reply.send({ ok: true });
    }
  });
}
