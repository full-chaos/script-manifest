import { cookies } from "next/headers";
import { ApiError } from "./fetcher";

const DEFAULT_GATEWAY_BASE = "http://localhost:4000";

function getApiGatewayBase(): string {
  return process.env.API_GATEWAY_URL ?? DEFAULT_GATEWAY_BASE;
}

export type ServerFetchInit = Omit<RequestInit, "headers"> & {
  headers?: HeadersInit;
  searchParams?: URLSearchParams | Record<string, string | number | boolean | undefined>;
};

function buildSearchParams(
  input: ServerFetchInit["searchParams"],
): URLSearchParams | null {
  if (!input) {
    return null;
  }
  if (input instanceof URLSearchParams) {
    return input;
  }
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === "") {
      continue;
    }
    params.set(key, String(value));
  }
  return params;
}

async function buildAuthorizedHeaders(caller?: HeadersInit): Promise<Headers> {
  const headers = new Headers({ Accept: "application/json" });
  if (caller) {
    new Headers(caller).forEach((value, key) => headers.set(key, value));
  }
  const cookieStore = await cookies();
  const token = cookieStore.get("sm_session")?.value;
  if (token) {
    headers.set("authorization", `Bearer ${token}`);
  }
  return headers;
}

export async function serverFetch<T>(
  path: string,
  init: ServerFetchInit = {},
): Promise<T> {
  const { headers, searchParams, ...rest } = init;
  const url = new URL(path, getApiGatewayBase());
  const params = buildSearchParams(searchParams);
  if (params) {
    for (const [key, value] of params.entries()) {
      url.searchParams.append(key, value);
    }
  }

  const response = await fetch(url, {
    cache: "no-store",
    ...rest,
    headers: await buildAuthorizedHeaders(headers),
  });

  if (response.status === 204) {
    return undefined as T;
  }

  if (!response.ok) {
    const rawText = await response.text();
    let body: unknown = rawText;
    let code: string | undefined;
    try {
      const parsed = JSON.parse(rawText) as unknown;
      body = parsed;
      if (
        parsed !== null &&
        typeof parsed === "object" &&
        "code" in parsed &&
        typeof (parsed as Record<string, unknown>).code === "string"
      ) {
        code = (parsed as Record<string, unknown>).code as string;
      }
    } catch {
      // body remains rawText
    }
    const message =
      body !== null &&
      typeof body === "object" &&
      "message" in body &&
      typeof (body as Record<string, unknown>).message === "string"
        ? ((body as Record<string, unknown>).message as string)
        : `HTTP ${response.status}`;
    throw new ApiError(message, { status: response.status, code, body });
  }

  return (await response.json()) as T;
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}
