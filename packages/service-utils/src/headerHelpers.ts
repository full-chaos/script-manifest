import type { FastifyRequest } from "fastify";

export function getAuthUserId(req: FastifyRequest): string | null {
  const value = req.headers["x-auth-user-id"];
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  return null;
}

export function readHeader(req: FastifyRequest, name: string): string | undefined {
  const value = req.headers[name];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * Extract a Bearer token from an Authorization header value.
 *
 * @param header - The raw `Authorization` header string (e.g. `"Bearer <token>"`).
 * @returns The token string if the scheme is `Bearer`, otherwise `null`.
 */
export function readBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token;
}
