import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

export type HealthCheckResult = Record<string, boolean>;

export type RegisterHealthRoutesOptions = {
  serviceName: string;
  /** Optional deep health check. If omitted, /health returns { ok: true } */
  onHealthCheck?: () => Promise<HealthCheckResult>;
  /** Rate limit config for health endpoints. Defaults to { max: 60, timeWindow: "1 minute" } */
  rateLimit?: { max: number; timeWindow: string };
};

export function registerHealthRoutes(server: FastifyInstance, options: RegisterHealthRoutesOptions): void {
  const rateLimitConfig = options.rateLimit ?? { max: 60, timeWindow: "1 minute" };

  server.get("/health/live", {
    config: { rateLimit: rateLimitConfig },
    handler: async () => ({ ok: true })
  });

  const deepCheck = async (_req: FastifyRequest, reply: FastifyReply) => {
    if (!options.onHealthCheck) {
      return reply.status(200).send({ service: options.serviceName, ok: true });
    }
    const checks: HealthCheckResult = {};
    try {
      const result = await options.onHealthCheck();
      Object.assign(checks, result);
    } catch {
      checks.unknown = false;
    }
    const ok = Object.values(checks).every(Boolean);
    return reply.status(ok ? 200 : 503).send({ service: options.serviceName, ok, checks });
  };

  server.get("/health", {
    config: { rateLimit: rateLimitConfig },
    handler: deepCheck
  });

  server.get("/health/ready", {
    config: { rateLimit: rateLimitConfig },
    handler: deepCheck
  });
}
