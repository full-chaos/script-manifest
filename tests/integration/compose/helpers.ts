import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

type RequestResult<T> = {
  status: number;
  body: T;
  rawBody: string;
};

export type SessionInfo = {
  token: string;
  user: {
    id: string;
    email: string;
    displayName: string;
    role?: string;
  };
};

export const API_BASE_URL = process.env.INTEGRATION_API_BASE_URL ?? "http://localhost:4000";
export const COMPETITION_SERVICE_BASE_URL =
  process.env.INTEGRATION_COMPETITION_BASE_URL ?? "http://localhost:4002";
export const RANKING_SERVICE_BASE_URL =
  process.env.INTEGRATION_RANKING_BASE_URL ?? "http://localhost:4007";

export function makeUnique(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, "")}`;
}

export function authHeaders(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}

export async function jsonRequest<T>(
  url: string,
  init?: RequestInit
): Promise<RequestResult<T>> {
  const response = await fetch(url, init);
  const rawBody = await response.text();
  let body: T;
  if (!rawBody) {
    body = {} as T;
  } else {
    try {
      body = JSON.parse(rawBody) as T;
    } catch {
      body = { rawBody } as T;
    }
  }
  return { status: response.status, body, rawBody };
}

export async function expectOkJson<T>(
  url: string,
  init?: RequestInit,
  expectedStatus = 200
): Promise<T> {
  const result = await jsonRequest<T>(url, init);
  assert.equal(
    result.status,
    expectedStatus,
    `Unexpected status for ${init?.method ?? "GET"} ${url}: ${result.status}\n${result.rawBody}`
  );
  return result.body;
}

export async function registerUser(label: string): Promise<SessionInfo> {
  const slug = `${label.toLowerCase()}-${randomUUID().slice(0, 8)}`;
  const payload = {
    email: `${slug}@example.com`,
    password: "password123",
    displayName: `Integration ${label}`
  };
  return expectOkJson<SessionInfo>(
    `${API_BASE_URL}/api/v1/auth/register`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    },
    201
  );
}
