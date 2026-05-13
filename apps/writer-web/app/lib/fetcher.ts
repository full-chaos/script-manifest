export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly body?: unknown;

  constructor(
    message: string,
    options: { status: number; code?: string; body?: unknown }
  ) {
    super(message);
    this.name = "ApiError";
    this.status = options.status;
    this.code = options.code;
    this.body = options.body;
  }
}

type JsonParseResult =
  | { ok: true; value: unknown }
  | { ok: false };

function tryParseJson(text: string): JsonParseResult {
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false };
  }
}

function buildHeaders(callerHeaders?: HeadersInit): Headers {
  const result = new Headers({ "Accept": "application/json" });
  if (callerHeaders) {
    new Headers(callerHeaders).forEach((value, key) => {
      result.set(key, value);
    });
  }
  return result;
}

export async function fetcher<T = unknown>(
  input: string | URL,
  init?: RequestInit
): Promise<T> {
  const { headers: callerHeaders, ...restInit } = init ?? {};

  const response = await fetch(input, {
    credentials: "include",
    cache: "no-store",
    ...restInit,
    headers: buildHeaders(callerHeaders),
  });

  if (response.status === 204) {
    return undefined as T;
  }

  if (!response.ok) {
    const rawText = await response.text();
    const parseResult = tryParseJson(rawText);

    const body: unknown = parseResult.ok ? parseResult.value : rawText;

    let code: string | undefined;
    if (
      parseResult.ok &&
      parseResult.value !== null &&
      typeof parseResult.value === "object" &&
      "code" in parseResult.value &&
      typeof (parseResult.value as Record<string, unknown>)["code"] === "string"
    ) {
      code = (parseResult.value as Record<string, unknown>)["code"] as string;
    }

    const message =
      body !== null &&
      typeof body === "object" &&
      "message" in body &&
      typeof (body as Record<string, unknown>)["message"] === "string"
        ? ((body as Record<string, unknown>)["message"] as string)
        : `HTTP ${response.status}`;

    throw new ApiError(message, { status: response.status, code, body });
  }

  return (await response.json()) as T;
}
