import type { FastifyInstance } from "fastify";
import type { GatewayContext } from "../helpers.js";

export function registerHealthRoutes(server: FastifyInstance, ctx: GatewayContext): void {
  const startedAt = Date.now();

  async function checkDownstream(
    name: string,
    base: string
  ): Promise<boolean> {
    try {
      const res = await ctx.requestFn(`${base}/health`, { method: "GET" });
      await res.body.text();
      return res.statusCode === 200;
    } catch {
      return false;
    }
  }

  async function runChecks(): Promise<Record<string, boolean>> {
    const [identity, profileProject, competitionDirectory, submissionTracking, scriptStorage, feedbackExchange, ranking] =
      await Promise.all([
        checkDownstream("identity", ctx.identityServiceBase),
        checkDownstream("profile-project", ctx.profileServiceBase),
        checkDownstream("competition-directory", ctx.competitionDirectoryBase),
        checkDownstream("submission-tracking", ctx.submissionTrackingBase),
        checkDownstream("script-storage", ctx.scriptStorageBase),
        checkDownstream("feedback-exchange", ctx.feedbackExchangeBase),
        checkDownstream("ranking", ctx.rankingServiceBase)
      ]);

    return {
      identity,
      "profile-project": profileProject,
      "competition-directory": competitionDirectory,
      "submission-tracking": submissionTracking,
      "script-storage": scriptStorage,
      "feedback-exchange": feedbackExchange,
      ranking
    };
  }

  server.get("/health", async (_req, reply) => {
    const checks = await runChecks();
    const ok = Object.values(checks).every(Boolean);
    return reply.status(ok ? 200 : 503).send({
      service: "api-gateway",
      ok,
      uptime: Math.floor((Date.now() - startedAt) / 1000),
      checks
    });
  });

  server.get("/health/live", async () => ({ ok: true }));

  server.get("/health/ready", async (_req, reply) => {
    const checks = await runChecks();
    const ok = Object.values(checks).every(Boolean);
    return reply.status(ok ? 200 : 503).send({
      service: "api-gateway",
      ok,
      uptime: Math.floor((Date.now() - startedAt) / 1000),
      checks
    });
  });
}
