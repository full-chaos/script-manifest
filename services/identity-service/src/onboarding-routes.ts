import type { FastifyInstance } from "fastify";
import { OnboardingProgressUpdateSchema } from "@script-manifest/contracts";
import { readBearerToken } from "@script-manifest/service-utils";
import type { OnboardingRepository } from "./onboarding-repository.js";
import type { IdentityRepository } from "./repository.js";

const STEP_TO_COLUMN = {
  profileCompleted: "profile_completed",
  projectAdded: "project_added",
  firstScriptUploaded: "first_script_uploaded",
  competitionsVisited: "competitions_visited",
  coverageVisited: "coverage_visited",
  submissionRecorded: "submission_recorded",
  placementRecorded: "placement_recorded",
  exportUsed: "export_used",
  shareUsed: "share_used"
} as const;

type OnboardingStepKey = keyof typeof STEP_TO_COLUMN;
type OnboardingProgressFlags = Partial<Record<OnboardingStepKey, boolean>>;

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
          projectAdded: progress.projectAdded,
          firstScriptUploaded: progress.firstScriptUploaded,
          competitionsVisited: progress.competitionsVisited,
          coverageVisited: progress.coverageVisited,
          submissionRecorded: progress.submissionRecorded,
          placementRecorded: progress.placementRecorded,
          exportUsed: progress.exportUsed,
          shareUsed: progress.shareUsed
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

      const progressFlags = parsed.data as OnboardingProgressFlags;
      for (const stepKey of Object.keys(STEP_TO_COLUMN) as OnboardingStepKey[]) {
        if (progressFlags[stepKey]) {
          await onboardingRepo.markStepComplete(sessionData.user.id, STEP_TO_COLUMN[stepKey]);
        }
      }

      return reply.send({ ok: true });
    }
  });
}
