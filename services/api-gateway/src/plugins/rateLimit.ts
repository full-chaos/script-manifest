import type { FastifyInstance } from "fastify";
import rateLimit from "@fastify/rate-limit";
import { Redis } from "ioredis";

export async function registerRateLimit(
  server: FastifyInstance,
  redisUrl?: string,
): Promise<void> {
  const redis = redisUrl ? new Redis(redisUrl) : undefined;

  if (redis) {
    server.addHook("onClose", async () => {
      await redis.quit();
    });
  }

  await server.register(rateLimit, {
    max: 100,
    timeWindow: "1 minute",
    allowList: [],
    ...(redis ? { redis } : {}),
  });
}
