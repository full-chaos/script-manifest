import type { FastifyBaseLogger, FastifyReply } from "fastify";
import { randomBytes } from "node:crypto";
import type { request } from "undici";
import { signServiceToken, type Role } from "@script-manifest/service-utils";

export type RequestFn = typeof request;
type AuthLogger = Pick<FastifyBaseLogger, "warn" | "error">;

export type GatewayContext = {
  requestFn: RequestFn;
  identityServiceBase: string;
  profileServiceBase: string;
  competitionDirectoryBase: string;
  submissionTrackingBase: string;
  scriptStorageBase: string;
  feedbackExchangeBase: string;
  rankingServiceBase: string;
  coverageMarketplaceBase: string;
  notificationServiceBase: string;
  industryPortalBase: string;
  programsServiceBase: string;
  partnerDashboardServiceBase: string;
  searchIndexerBase: string;
  competitionAdminAllowlist: Set<string>;
  coverageAdminAllowlist: Set<string>;
  industryAdminAllowlist: Set<string>;
  adminAllowlist: Set<string>;
};

// ── Auth token TTL cache (CHAOS-581) ─────────────────────────────────
const AUTH_CACHE_TTL_MS = Number(process.env.AUTH_CACHE_TTL_MS ?? 30_000); // default 30s
const AUTH_CACHE_MAX = Number(process.env.AUTH_CACHE_MAX ?? 1000);

type AuthCacheEntry = { userId: string | null; expiresAt: number };
const authCache = new Map<string, AuthCacheEntry>();

function authCacheGet(token: string): string | null | undefined {
  const entry = authCache.get(token);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    authCache.delete(token);
    return undefined;
  }
  return entry.userId;
}

function authCacheSet(token: string, userId: string | null): void {
  // Evict oldest entries if over max
  if (authCache.size >= AUTH_CACHE_MAX) {
    const firstKey = authCache.keys().next().value;
    if (firstKey !== undefined) authCache.delete(firstKey);
  }
  authCache.set(token, { userId, expiresAt: Date.now() + AUTH_CACHE_TTL_MS });
}

/** Exposed for testing — clears the auth cache. */
export function clearAuthCache(): void {
  authCache.clear();
}

const devServiceTokenSecret = randomBytes(32).toString("hex");

function resolveServiceTokenSecret(): string | null {
  const configured = process.env.SERVICE_TOKEN_SECRET;
  if (configured && configured.length > 0) {
    return configured;
  }

  // CHAOS-914: In production, a missing SERVICE_TOKEN_SECRET is a fatal
  // misconfiguration — fail loudly rather than silently using a random value
  // that would be regenerated on every restart and invalidate all tokens.
  if ((process.env.NODE_ENV ?? "development") === "production") {
    throw new Error("SERVICE_TOKEN_SECRET environment variable must be set in production");
  }

  return devServiceTokenSecret;
}

export function buildQuerySuffix(rawQuery: unknown): string {
  const query = rawQuery as Record<string, string | string[] | undefined>;
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (typeof value === "string") {
      searchParams.append(key, value);
      continue;
    }

    if (Array.isArray(value)) {
      for (const arrayValue of value) {
        searchParams.append(key, arrayValue);
      }
    }
  }

  return searchParams.size > 0 ? `?${searchParams.toString()}` : "";
}

export async function getUserIdFromAuth(
  requestFn: RequestFn,
  identityServiceBase: string,
  authorization: string | undefined,
  logger?: AuthLogger
): Promise<string | null> {
  if (!authorization) {
    return null;
  }

  // Check cache first (CHAOS-581)
  const cached = authCacheGet(authorization);
  if (cached !== undefined) {
    return cached;
  }

  try {
    const response = await requestFn(`${identityServiceBase}/internal/auth/me`, {
      method: "GET",
      headers: { authorization }
    });

    if (response.statusCode !== 200) {
      logger?.warn(`Auth verification failed with status ${response.statusCode}`);
      // CHAOS-913: Only cache definitive auth failures (401/403), not transient
      // server errors (5xx) — caching 5xx would lock out users during outages.
      if (response.statusCode === 401 || response.statusCode === 403) {
        authCacheSet(authorization, null);
      }
      return null;
    }

    const body = (await response.body.json()) as { user?: { id?: string } };
    if (!body?.user?.id) {
      logger?.warn({ body }, "Auth response missing user.id");
      authCacheSet(authorization, null);
      return null;
    }
    authCacheSet(authorization, body.user.id);
    return body.user.id;
  } catch (error) {
    logger?.error(error, "Error verifying auth token");
    return null;
  }
}

export function addAuthUserIdHeader(
  headers: Record<string, string>,
  userId: string | null,
  role: Role = "writer"
): Record<string, string> {
  if (userId) {
    const nextHeaders: Record<string, string> = { ...headers, "x-auth-user-id": userId };
    const secret = resolveServiceTokenSecret();
    if (secret) {
      nextHeaders["x-service-token"] = signServiceToken({ sub: userId, role }, secret);
    }

    return nextHeaders;
  }

  return headers;
}

export function copyAuthHeader(authorization: string | undefined): Record<string, string> {
  if (!authorization) {
    return {};
  }

  return { authorization };
}

export async function resolveAdminUserId(
  requestFn: RequestFn,
  identityServiceBase: string,
  headers: Record<string, unknown>,
  allowlist: Set<string>,
  logger?: AuthLogger
): Promise<string | null> {
  // CHAOS-911 / defense-in-depth: x-admin-user-id here is safe ONLY because
  // the preValidation hook in index.ts strips this header from all incoming
  // client requests before route handlers run.  Any value present at this
  // point was set by the gateway itself (e.g. a downstream service-to-service
  // call) — it is NOT client-supplied.  Do not call this function from a
  // context where preValidation has not already stripped external headers.
  const headerAdminUserId = readHeaderValue(headers, "x-admin-user-id");
  if (headerAdminUserId && allowlist.has(headerAdminUserId)) {
    return headerAdminUserId;
  }

  const authorization = readHeaderValue(headers, "authorization");
  const authedUserId = await getUserIdFromAuth(requestFn, identityServiceBase, authorization, logger);
  if (authedUserId && allowlist.has(authedUserId)) {
    return authedUserId;
  }

  return null;
}

export async function resolveUserId(
  requestFn: RequestFn,
  identityServiceBase: string,
  headers: Record<string, unknown>,
  logger?: AuthLogger
): Promise<string | null> {
  // CHAOS-911 / defense-in-depth: x-auth-user-id, x-partner-user-id, and
  // x-admin-user-id are safe to read here ONLY because the preValidation hook
  // in index.ts strips all three from incoming client requests before any route
  // handler runs.  Values present at this point were set by the gateway itself
  // (e.g. after a successful Bearer-token verification) — they are NOT
  // client-supplied.  Do not call this function from a context where
  // preValidation has not already stripped external identity headers.
  const headerUserId =
    readHeaderValue(headers, "x-auth-user-id") ??
    readHeaderValue(headers, "x-partner-user-id") ??
    readHeaderValue(headers, "x-admin-user-id");
  if (headerUserId) {
    return headerUserId;
  }

  const authorization = readHeaderValue(headers, "authorization");
  const authedUserId = await getUserIdFromAuth(requestFn, identityServiceBase, authorization, logger);
  return authedUserId;
}

export function readHeaderValue(headers: Record<string, unknown>, headerName: string): string | undefined {
  const rawValue = headers[headerName];
  if (typeof rawValue === "string" && rawValue.length > 0) {
    return rawValue;
  }
  return undefined;
}

export function parseAllowlist(rawValue: string): string[] {
  return rawValue
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

export async function proxyJsonRequest(
  reply: FastifyReply,
  requestFn: RequestFn,
  url: string,
  options: Parameters<RequestFn>[1],
  requestId?: string
) {
  try {
    const mergedOptions = requestId
      ? {
          ...options,
          headers: {
            ...(options?.headers as Record<string, string> | undefined),
            "x-request-id": requestId,
          },
        }
      : options;
    const upstream = await requestFn(url, mergedOptions);
    // CHAOS-584: Pass raw body through to avoid double JSON parse+serialize.
    // Read as text once, set content-type, and send the raw string — Fastify
    // won't re-serialize a string when content-type is already set.
    const rawBody = await upstream.body.text();
    const contentType = (upstream.headers as Record<string, string> | undefined)?.["content-type"];
    if (contentType) {
      void reply.header("content-type", contentType);
    }
    return reply.status(upstream.statusCode).send(rawBody || null);
  } catch (error) {
    return reply.status(502).send({
      error: "upstream_unavailable",
      detail: error instanceof Error ? error.message : "unknown_error"
    });
  }
}

export function safeJsonParse(payload: string): unknown {
  try {
    return JSON.parse(payload) as unknown;
  } catch {
    return payload;
  }
}
