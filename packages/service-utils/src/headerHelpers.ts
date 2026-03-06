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
