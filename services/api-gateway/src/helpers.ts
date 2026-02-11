import type { FastifyReply } from "fastify";
import type { request } from "undici";

export type RequestFn = typeof request;

export type GatewayContext = {
  requestFn: RequestFn;
  identityServiceBase: string;
  profileServiceBase: string;
  competitionDirectoryBase: string;
  submissionTrackingBase: string;
  scriptStorageBase: string;
  competitionAdminAllowlist: Set<string>;
};

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
  authorization: string | undefined
): Promise<string | null> {
  if (!authorization) {
    return null;
  }

  try {
    const response = await requestFn(`${identityServiceBase}/internal/auth/me`, {
      method: "GET",
      headers: { authorization }
    });

    if (response.statusCode !== 200) {
      console.warn(`Auth verification failed with status ${response.statusCode}`);
      return null;
    }

    const body = (await response.body.json()) as { user?: { id?: string } };
    if (!body?.user?.id) {
      console.warn("Auth response missing user.id", body);
      return null;
    }
    return body.user.id;
  } catch (error) {
    console.error("Error verifying auth token:", error);
    return null;
  }
}

export function addAuthUserIdHeader(
  headers: Record<string, string>,
  userId: string | null
): Record<string, string> {
  if (userId) {
    return { ...headers, "x-auth-user-id": userId };
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
  allowlist: Set<string>
): Promise<string | null> {
  const headerAdminUserId = readHeaderValue(headers, "x-admin-user-id");
  if (headerAdminUserId && allowlist.has(headerAdminUserId)) {
    return headerAdminUserId;
  }

  const authorization = readHeaderValue(headers, "authorization");
  const authedUserId = await getUserIdFromAuth(requestFn, identityServiceBase, authorization);
  if (authedUserId && allowlist.has(authedUserId)) {
    return authedUserId;
  }

  return null;
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
    const body = rawBody.length > 0 ? safeJsonParse(rawBody) : null;
    return reply.status(upstream.statusCode).send(body);
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
