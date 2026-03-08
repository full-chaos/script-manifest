import type { FastifyInstance } from "fastify";
import type { RequestFn } from "../helpers.js";

const CACHE_TTL_MS = 30_000; // 30 seconds
const CACHE_MAX = 5000;

type CacheEntry = { blocked: boolean; expiresAt: number };
const ipCache = new Map<string, CacheEntry>();

function cacheGet(ip: string): boolean | undefined {
  const entry = ipCache.get(ip);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    ipCache.delete(ip);
    return undefined;
  }
  return entry.blocked;
}

function cacheSet(ip: string, blocked: boolean): void {
  if (ipCache.size >= CACHE_MAX) {
    const firstKey = ipCache.keys().next().value;
    if (firstKey !== undefined) ipCache.delete(firstKey);
  }
  ipCache.set(ip, { blocked, expiresAt: Date.now() + CACHE_TTL_MS });
}

/** Exposed for testing — clears the IP blocklist cache. */
export function clearIpBlockCache(): void {
  ipCache.clear();
}

export function registerIpBlocklist(
  server: FastifyInstance,
  requestFn: RequestFn,
  identityServiceBase: string
): void {
  server.addHook("preHandler", async (req, reply) => {
    // Skip health checks and docs
    if (req.url.startsWith("/health") || req.url.startsWith("/docs")) {
      return;
    }

    const clientIp = req.ip;
    if (!clientIp) return;

    // Check cache first
    const cached = cacheGet(clientIp);
    if (cached === true) {
      return reply.status(403).send({ error: "ip_blocked" });
    }
    if (cached === false) {
      return; // Known not blocked
    }

    // Cache miss — check with identity service
    try {
      const response = await requestFn(
        `${identityServiceBase}/internal/admin/ip-blocks/check/${encodeURIComponent(clientIp)}`,
        { method: "GET" }
      );

      if (response.statusCode === 200) {
        const body = await response.body.json() as { blocked?: boolean };
        const blocked = body?.blocked === true;
        cacheSet(clientIp, blocked);
        if (blocked) {
          return reply.status(403).send({ error: "ip_blocked" });
        }
      } else {
        // On error, don't block — fail open
        await response.body.dump();
      }
    } catch {
      // On network error, fail open — don't block legitimate traffic
    }
  });
}
