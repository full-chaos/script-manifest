import type { FastifyBaseLogger, FastifyReply } from "fastify";
import { randomBytes } from "node:crypto";
import type { request } from "undici";
import { signServiceToken, type Role } from "@script-manifest/service-utils";

export type RequestFn = typeof request;
type AuthLogger = Pick<FastifyBaseLogger, "warn" | "error">;
const AUTH_CACHE_TTL_MS = Number(process.env.AUTH_CACHE_TTL_MS ?? 30000);
const AUTH_CACHE_MAX_ENTRIES = 10000;

export const authCache = new Map<string, { userId: string; expiresAt: number }>();

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
  industryPortalBase: string;
  programsServiceBase: string;
  partnerDashboardServiceBase: string;
  competitionAdminAllowlist: Set<string>;
  coverageAdminAllowlist: Set<string>;
  industryAdminAllowlist: Set<string>;
};

const devServiceTokenSecret = randomBytes(32).toString("hex");

function evictExpiredAuthCacheEntries(now: number): void {
  for (const [token, entry] of authCache.entries()) {
    if (entry.expiresAt <= now) {
      authCache.delete(token);
    }
  }
}

function resolveServiceTokenSecret(): string | null {
  const configured = process.env.SERVICE_TOKEN_SECRET;
  if (configured && configured.length > 0) {
    return configured;
  }

  if ((process.env.NODE_ENV ?? "development") !== "production") {
    return devServiceTokenSecret;
  }

  return null;
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

  const now = Date.now();
  evictExpiredAuthCacheEntries(now);
  const cachedEntry = authCache.get(authorization);
  if (cachedEntry) {
    return cachedEntry.userId;
  }

  try {
    const response = await requestFn(`${identityServiceBase}/internal/auth/me`, {
      method: "GET",
      headers: { authorization }
    });

    if (response.statusCode !== 200) {
      logger?.warn(`Auth verification failed with status ${response.statusCode}`);
      return null;
    }

    const body = (await response.body.json()) as { user?: { id?: string } };
    if (!body?.user?.id) {
      logger?.warn({ body }, "Auth response missing user.id");
      return null;
    }

    if (authCache.size >= AUTH_CACHE_MAX_ENTRIES) {
      authCache.clear();
    }
    authCache.set(authorization, {
      userId: body.user.id,
      expiresAt: Date.now() + AUTH_CACHE_TTL_MS
    });
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
    const rawBody = await upstream.body.text();
    const response = reply.status(upstream.statusCode);
    if (rawBody.length === 0) {
      return response.send(null);
    }

    const maybeHeaderReply = response as FastifyReply & {
      header?: (name: string, value: string) => FastifyReply;
    };
    if (typeof maybeHeaderReply.header === "function") {
      return maybeHeaderReply.header("content-type", "application/json").send(rawBody);
    }
    return response.send(rawBody);
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
