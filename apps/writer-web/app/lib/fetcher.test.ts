import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, fetcher } from "./fetcher";

function makeResponse(opts: {
  status: number;
  body?: string;
  contentType?: string;
}): Response {
  const body = opts.body ?? "";
  const ok = opts.status >= 200 && opts.status < 300;
  const headers = new Headers({
    "Content-Type": opts.contentType ?? "application/json",
  });
  return {
    ok,
    status: opts.status,
    headers,
    text: () => Promise.resolve(body),
    json: () => Promise.resolve(JSON.parse(body)),
  } as unknown as Response;
}

describe("fetcher", () => {
  const mockFetch = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    mockFetch.mockReset();
  });

  describe("successful responses", () => {
    it("returns parsed JSON body typed as T on 200", async () => {
      const payload = { id: 1, name: "Alice" };
      mockFetch.mockResolvedValueOnce(
        makeResponse({ status: 200, body: JSON.stringify(payload) })
      );

      const result = await fetcher<{ id: number; name: string }>("/api/users/1");

      expect(result).toEqual(payload);
    });

    it("returns undefined on 204 No Content", async () => {
      mockFetch.mockResolvedValueOnce(makeResponse({ status: 204, body: "" }));

      const result = await fetcher("/api/resource");

      expect(result).toBeUndefined();
    });
  });

  describe("error responses", () => {
    it("throws ApiError with parsed body on 4xx JSON error", async () => {
      const errorBody = { code: "AUTH_INVALID", message: "Token expired" };
      mockFetch.mockResolvedValueOnce(
        makeResponse({ status: 401, body: JSON.stringify(errorBody) })
      );

      await expect(fetcher("/api/protected")).rejects.toSatisfy((err: unknown) => {
        if (!(err instanceof ApiError)) return false;
        expect(err.status).toBe(401);
        expect(err.code).toBe("AUTH_INVALID");
        expect(err.message).toBe("Token expired");
        expect(err.body).toEqual(errorBody);
        return true;
      });
    });

    it("throws ApiError with raw text body on 5xx non-JSON response", async () => {
      const htmlBody = "<html><body>Internal Server Error</body></html>";
      mockFetch.mockResolvedValueOnce(
        makeResponse({ status: 500, body: htmlBody, contentType: "text/html" })
      );

      await expect(fetcher("/api/data")).rejects.toSatisfy((err: unknown) => {
        if (!(err instanceof ApiError)) return false;
        expect(err.status).toBe(500);
        expect(err.code).toBeUndefined();
        expect(err.body).toBe(htmlBody);
        expect(err.message).toBe("HTTP 500");
        return true;
      });
    });

    it("uses generic 'HTTP <status>' message when JSON body has no message field", async () => {
      const errorBody = { code: "NOT_FOUND" };
      mockFetch.mockResolvedValueOnce(
        makeResponse({ status: 404, body: JSON.stringify(errorBody) })
      );

      await expect(fetcher("/api/thing")).rejects.toSatisfy((err: unknown) => {
        if (!(err instanceof ApiError)) return false;
        expect(err.message).toBe("HTTP 404");
        expect(err.code).toBe("NOT_FOUND");
        return true;
      });
    });

    it("instanceof ApiError is true for thrown errors", async () => {
      mockFetch.mockResolvedValueOnce(
        makeResponse({ status: 400, body: JSON.stringify({ message: "Bad request" }) })
      );

      let caught: unknown;
      try {
        await fetcher("/api/thing");
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeInstanceOf(ApiError);
    });
  });

  describe("default request options", () => {
    it("sends credentials=include, cache=no-store, Accept=application/json by default", async () => {
      mockFetch.mockResolvedValueOnce(
        makeResponse({ status: 200, body: JSON.stringify({}) })
      );

      await fetcher("/api/test");

      expect(mockFetch).toHaveBeenCalledOnce();
      const firstCall = mockFetch.mock.calls[0];
      expect(firstCall).toBeDefined();
      const [, init] = firstCall as [string | URL | Request, RequestInit | undefined];
      expect(init).toMatchObject({
        credentials: "include",
        cache: "no-store",
      });

      const sentHeaders = new Headers(init?.headers as HeadersInit);
      expect(sentHeaders.get("accept")).toBe("application/json");
    });
  });

  describe("header merging", () => {
    it("merges caller headers with defaults, caller wins on conflicts", async () => {
      mockFetch.mockResolvedValueOnce(
        makeResponse({ status: 200, body: JSON.stringify({}) })
      );

      await fetcher("/api/test", {
        headers: {
          "Accept": "text/plain",
          "X-Custom": "yes",
        },
      });

      const [, init] = mockFetch.mock.calls[0] as [string | URL | Request, RequestInit | undefined];
      const sentHeaders = new Headers(init?.headers as HeadersInit);
      expect(sentHeaders.get("accept")).toBe("text/plain");
      expect(sentHeaders.get("x-custom")).toBe("yes");
    });

    it("accepts Headers instance from caller and merges correctly", async () => {
      mockFetch.mockResolvedValueOnce(
        makeResponse({ status: 200, body: JSON.stringify({}) })
      );

      const callerHeaders = new Headers({ "Authorization": "Bearer token123" });
      await fetcher("/api/secure", { headers: callerHeaders });

      const [, init] = mockFetch.mock.calls[0] as [string | URL | Request, RequestInit | undefined];
      const sentHeaders = new Headers(init?.headers as HeadersInit);
      expect(sentHeaders.get("authorization")).toBe("Bearer token123");
      expect(sentHeaders.get("accept")).toBe("application/json");
    });
  });

  describe("AbortController / signal", () => {
    it("forwards caller signal to fetch", async () => {
      const controller = new AbortController();
      mockFetch.mockResolvedValueOnce(
        makeResponse({ status: 200, body: JSON.stringify({ ok: true }) })
      );

      await fetcher("/api/data", { signal: controller.signal });

      const [, init] = mockFetch.mock.calls[0] as [string | URL | Request, RequestInit | undefined];
      expect(init).toMatchObject({ signal: controller.signal });
    });

    it("propagates AbortError when controller aborts", async () => {
      const controller = new AbortController();
      const abortError = Object.assign(new Error("The operation was aborted"), {
        name: "AbortError",
      });
      mockFetch.mockRejectedValueOnce(abortError);

      controller.abort();

      await expect(
        fetcher("/api/slow", { signal: controller.signal })
      ).rejects.toMatchObject({ name: "AbortError" });
    });
  });
});
