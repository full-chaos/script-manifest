import assert from "node:assert/strict";
import test from "node:test";
import { request } from "undici";
import { buildServer } from "../index.js";

type RequestResult = Awaited<ReturnType<typeof request>>;

function jsonResponse(payload: unknown, statusCode = 200): RequestResult {
  return {
    statusCode,
    body: {
      json: async () => payload,
      text: async () => JSON.stringify(payload)
    }
  } as RequestResult;
}

test("GET /api/v1/feedback/tokens/balance requires auth and proxies to user balance", async (t) => {
  const urls: string[] = [];
  const headers: Record<string, string>[] = [];
  const server = buildServer({
    logger: false,
    requestFn: (async (url, options) => {
      const urlStr = String(url);
      if (urlStr.includes("/internal/auth/me")) {
        return jsonResponse({
          user: { id: "writer_01", email: "writer@example.com", displayName: "Writer One" },
          expiresAt: "2026-12-31T00:00:00.000Z"
        });
      }
      urls.push(urlStr);
      headers.push((options?.headers as Record<string, string> | undefined) ?? {});
      return jsonResponse({ balance: 10 });
    }) as typeof request,
    identityServiceBase: "http://identity-svc",
    feedbackExchangeBase: "http://feedback-svc"
  });
  t.after(async () => {
    await server.close();
  });

  // Unauthenticated — 401
  const forbidden = await server.inject({
    method: "GET",
    url: "/api/v1/feedback/tokens/balance"
  });
  assert.equal(forbidden.statusCode, 401);
  assert.equal(urls.length, 0);

  // Authenticated — proxied to user-specific balance URL
  const ok = await server.inject({
    method: "GET",
    url: "/api/v1/feedback/tokens/balance",
    headers: { authorization: "Bearer sess_1" }
  });
  assert.equal(ok.statusCode, 200);
  assert.equal(urls[0], "http://feedback-svc/internal/tokens/writer_01/balance");
  assert.equal(headers[0]?.["x-auth-user-id"], "writer_01");
});

test("GET /api/v1/feedback/tokens/transactions requires auth and proxies to user transactions", async (t) => {
  const urls: string[] = [];
  const headers: Record<string, string>[] = [];
  const server = buildServer({
    logger: false,
    requestFn: (async (url, options) => {
      const urlStr = String(url);
      if (urlStr.includes("/internal/auth/me")) {
        return jsonResponse({
          user: { id: "writer_01", email: "writer@example.com", displayName: "Writer One" },
          expiresAt: "2026-12-31T00:00:00.000Z"
        });
      }
      urls.push(urlStr);
      headers.push((options?.headers as Record<string, string> | undefined) ?? {});
      return jsonResponse({ transactions: [] });
    }) as typeof request,
    identityServiceBase: "http://identity-svc",
    feedbackExchangeBase: "http://feedback-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const forbidden = await server.inject({
    method: "GET",
    url: "/api/v1/feedback/tokens/transactions"
  });
  assert.equal(forbidden.statusCode, 401);

  const ok = await server.inject({
    method: "GET",
    url: "/api/v1/feedback/tokens/transactions",
    headers: { authorization: "Bearer sess_1" }
  });
  assert.equal(ok.statusCode, 200);
  assert.equal(urls[0], "http://feedback-svc/internal/tokens/writer_01/transactions");
  assert.equal(headers[0]?.["x-auth-user-id"], "writer_01");
});

test("POST /api/v1/feedback/tokens/grant-signup requires auth and proxies with user id", async (t) => {
  const urls: string[] = [];
  const headers: Record<string, string>[] = [];
  const server = buildServer({
    logger: false,
    requestFn: (async (url, options) => {
      const urlStr = String(url);
      if (urlStr.includes("/internal/auth/me")) {
        return jsonResponse({
          user: { id: "writer_01", email: "writer@example.com", displayName: "Writer One" },
          expiresAt: "2026-12-31T00:00:00.000Z"
        });
      }
      urls.push(urlStr);
      headers.push((options?.headers as Record<string, string> | undefined) ?? {});
      return jsonResponse({ tokens: 5 });
    }) as typeof request,
    identityServiceBase: "http://identity-svc",
    feedbackExchangeBase: "http://feedback-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const forbidden = await server.inject({
    method: "POST",
    url: "/api/v1/feedback/tokens/grant-signup",
    payload: {}
  });
  assert.equal(forbidden.statusCode, 401);

  const ok = await server.inject({
    method: "POST",
    url: "/api/v1/feedback/tokens/grant-signup",
    headers: { authorization: "Bearer sess_1" },
    payload: {}
  });
  assert.equal(ok.statusCode, 200);
  assert.equal(urls[0], "http://feedback-svc/internal/tokens/grant-signup");
  assert.equal(headers[0]?.["x-auth-user-id"], "writer_01");
});

test("POST /api/v1/feedback/listings requires auth and proxies to feedback exchange", async (t) => {
  const urls: string[] = [];
  const headers: Record<string, string>[] = [];
  const server = buildServer({
    logger: false,
    requestFn: (async (url, options) => {
      const urlStr = String(url);
      if (urlStr.includes("/internal/auth/me")) {
        return jsonResponse({
          user: { id: "writer_01", email: "writer@example.com", displayName: "Writer One" },
          expiresAt: "2026-12-31T00:00:00.000Z"
        });
      }
      urls.push(urlStr);
      headers.push((options?.headers as Record<string, string> | undefined) ?? {});
      return jsonResponse({ listing: { id: "listing_01" } }, 201);
    }) as typeof request,
    identityServiceBase: "http://identity-svc",
    feedbackExchangeBase: "http://feedback-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const forbidden = await server.inject({
    method: "POST",
    url: "/api/v1/feedback/listings",
    payload: { scriptId: "script_01", tokenCost: 3 }
  });
  assert.equal(forbidden.statusCode, 401);

  const ok = await server.inject({
    method: "POST",
    url: "/api/v1/feedback/listings",
    headers: { authorization: "Bearer sess_1" },
    payload: { scriptId: "script_01", tokenCost: 3 }
  });
  assert.equal(ok.statusCode, 201);
  assert.equal(urls[0], "http://feedback-svc/internal/listings");
  assert.equal(headers[0]?.["x-auth-user-id"], "writer_01");
});

test("GET /api/v1/feedback/listings proxies query params without auth requirement", async (t) => {
  const urls: string[] = [];
  const server = buildServer({
    logger: false,
    requestFn: (async (url) => {
      urls.push(String(url));
      return jsonResponse({ listings: [] });
    }) as typeof request,
    feedbackExchangeBase: "http://feedback-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const response = await server.inject({
    method: "GET",
    url: "/api/v1/feedback/listings?genre=Drama&status=open"
  });

  assert.equal(response.statusCode, 200);
  assert.equal(urls[0], "http://feedback-svc/internal/listings?genre=Drama&status=open");
});

test("GET /api/v1/feedback/listings/:listingId proxies without auth", async (t) => {
  const urls: string[] = [];
  const server = buildServer({
    logger: false,
    requestFn: (async (url) => {
      urls.push(String(url));
      return jsonResponse({ listing: { id: "listing_01" } });
    }) as typeof request,
    feedbackExchangeBase: "http://feedback-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const response = await server.inject({
    method: "GET",
    url: "/api/v1/feedback/listings/listing_01"
  });

  assert.equal(response.statusCode, 200);
  assert.equal(urls[0], "http://feedback-svc/internal/listings/listing_01");
});

test("POST /api/v1/feedback/listings/:listingId/claim requires auth and auto-approves script access", async (t) => {
  const urls: string[] = [];
  const headers: Record<string, string>[] = [];
  const server = buildServer({
    logger: false,
    requestFn: (async (url, options) => {
      const urlStr = String(url);
      if (urlStr.includes("/internal/auth/me")) {
        return jsonResponse({
          user: { id: "reviewer_01", email: "reviewer@example.com", displayName: "Reviewer One" },
          expiresAt: "2026-12-31T00:00:00.000Z"
        });
      }
      urls.push(urlStr);
      headers.push((options?.headers as Record<string, string> | undefined) ?? {});
      if (urlStr.includes("/claim")) {
        return jsonResponse({
          listing: { id: "listing_01", scriptId: "script_01", ownerUserId: "writer_01" }
        }, 201);
      }
      return jsonResponse({ ok: true });
    }) as typeof request,
    identityServiceBase: "http://identity-svc",
    feedbackExchangeBase: "http://feedback-svc",
    scriptStorageBase: "http://script-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const forbidden = await server.inject({
    method: "POST",
    url: "/api/v1/feedback/listings/listing_01/claim",
    payload: {}
  });
  assert.equal(forbidden.statusCode, 401);

  const ok = await server.inject({
    method: "POST",
    url: "/api/v1/feedback/listings/listing_01/claim",
    headers: { authorization: "Bearer sess_1" },
    payload: {}
  });
  assert.equal(ok.statusCode, 201);
  assert.equal(urls[0], "http://feedback-svc/internal/listings/listing_01/claim");
  assert.equal(headers[0]?.["x-auth-user-id"], "reviewer_01");

  // Wait briefly for the fire-and-forget script access approval
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.ok(urls.some((u) => u === "http://script-svc/internal/scripts/script_01/approve-viewer"));
});

test("POST /api/v1/feedback/listings/:listingId/cancel requires auth", async (t) => {
  const urls: string[] = [];
  const headers: Record<string, string>[] = [];
  const server = buildServer({
    logger: false,
    requestFn: (async (url, options) => {
      const urlStr = String(url);
      if (urlStr.includes("/internal/auth/me")) {
        return jsonResponse({
          user: { id: "writer_01", email: "writer@example.com", displayName: "Writer One" },
          expiresAt: "2026-12-31T00:00:00.000Z"
        });
      }
      urls.push(urlStr);
      headers.push((options?.headers as Record<string, string> | undefined) ?? {});
      return jsonResponse({ listing: { id: "listing_01", status: "cancelled" } });
    }) as typeof request,
    identityServiceBase: "http://identity-svc",
    feedbackExchangeBase: "http://feedback-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const forbidden = await server.inject({
    method: "POST",
    url: "/api/v1/feedback/listings/listing_01/cancel",
    payload: {}
  });
  assert.equal(forbidden.statusCode, 401);

  const ok = await server.inject({
    method: "POST",
    url: "/api/v1/feedback/listings/listing_01/cancel",
    headers: { authorization: "Bearer sess_1" },
    payload: {}
  });
  assert.equal(ok.statusCode, 200);
  assert.equal(urls[0], "http://feedback-svc/internal/listings/listing_01/cancel");
  assert.equal(headers[0]?.["x-auth-user-id"], "writer_01");
});

test("GET /api/v1/feedback/reviews requires auth and forwards query params", async (t) => {
  const urls: string[] = [];
  const headers: Record<string, string>[] = [];
  const server = buildServer({
    logger: false,
    requestFn: (async (url, options) => {
      const urlStr = String(url);
      if (urlStr.includes("/internal/auth/me")) {
        return jsonResponse({
          user: { id: "writer_01", email: "writer@example.com", displayName: "Writer One" },
          expiresAt: "2026-12-31T00:00:00.000Z"
        });
      }
      urls.push(urlStr);
      headers.push((options?.headers as Record<string, string> | undefined) ?? {});
      return jsonResponse({ reviews: [] });
    }) as typeof request,
    identityServiceBase: "http://identity-svc",
    feedbackExchangeBase: "http://feedback-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const forbidden = await server.inject({
    method: "GET",
    url: "/api/v1/feedback/reviews"
  });
  assert.equal(forbidden.statusCode, 401);

  const ok = await server.inject({
    method: "GET",
    url: "/api/v1/feedback/reviews?status=submitted",
    headers: { authorization: "Bearer sess_1" }
  });
  assert.equal(ok.statusCode, 200);
  assert.equal(urls[0], "http://feedback-svc/internal/reviews?status=submitted");
  assert.equal(headers[0]?.["x-auth-user-id"], "writer_01");
});

test("GET /api/v1/feedback/reviews/:reviewId proxies and passes auth header if present", async (t) => {
  const urls: string[] = [];
  const headers: Record<string, string>[] = [];
  const server = buildServer({
    logger: false,
    requestFn: (async (url, options) => {
      const urlStr = String(url);
      if (urlStr.includes("/internal/auth/me")) {
        return jsonResponse({
          user: { id: "writer_01", email: "writer@example.com", displayName: "Writer One" },
          expiresAt: "2026-12-31T00:00:00.000Z"
        });
      }
      urls.push(urlStr);
      headers.push((options?.headers as Record<string, string> | undefined) ?? {});
      return jsonResponse({ review: { id: "review_01" } });
    }) as typeof request,
    identityServiceBase: "http://identity-svc",
    feedbackExchangeBase: "http://feedback-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const response = await server.inject({
    method: "GET",
    url: "/api/v1/feedback/reviews/review_01",
    headers: { authorization: "Bearer sess_1" }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(urls[0], "http://feedback-svc/internal/reviews/review_01");
  assert.equal(headers[0]?.["x-auth-user-id"], "writer_01");
});

test("POST /api/v1/feedback/reviews/:reviewId/submit requires auth", async (t) => {
  const urls: string[] = [];
  const headers: Record<string, string>[] = [];
  const server = buildServer({
    logger: false,
    requestFn: (async (url, options) => {
      const urlStr = String(url);
      if (urlStr.includes("/internal/auth/me")) {
        return jsonResponse({
          user: { id: "reviewer_01", email: "reviewer@example.com", displayName: "Reviewer One" },
          expiresAt: "2026-12-31T00:00:00.000Z"
        });
      }
      urls.push(urlStr);
      headers.push((options?.headers as Record<string, string> | undefined) ?? {});
      return jsonResponse({ review: { id: "review_01", status: "submitted" } });
    }) as typeof request,
    identityServiceBase: "http://identity-svc",
    feedbackExchangeBase: "http://feedback-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const forbidden = await server.inject({
    method: "POST",
    url: "/api/v1/feedback/reviews/review_01/submit",
    payload: { overallRating: 4, comments: "Great script" }
  });
  assert.equal(forbidden.statusCode, 401);

  const ok = await server.inject({
    method: "POST",
    url: "/api/v1/feedback/reviews/review_01/submit",
    headers: { authorization: "Bearer sess_1" },
    payload: { overallRating: 4, comments: "Great script" }
  });
  assert.equal(ok.statusCode, 200);
  assert.equal(urls[0], "http://feedback-svc/internal/reviews/review_01/submit");
  assert.equal(headers[0]?.["x-auth-user-id"], "reviewer_01");
});

test("POST /api/v1/feedback/reviews/:reviewId/rate requires auth", async (t) => {
  const urls: string[] = [];
  const headers: Record<string, string>[] = [];
  const server = buildServer({
    logger: false,
    requestFn: (async (url, options) => {
      const urlStr = String(url);
      if (urlStr.includes("/internal/auth/me")) {
        return jsonResponse({
          user: { id: "writer_01", email: "writer@example.com", displayName: "Writer One" },
          expiresAt: "2026-12-31T00:00:00.000Z"
        });
      }
      urls.push(urlStr);
      headers.push((options?.headers as Record<string, string> | undefined) ?? {});
      return jsonResponse({ rating: { stars: 5 } });
    }) as typeof request,
    identityServiceBase: "http://identity-svc",
    feedbackExchangeBase: "http://feedback-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const forbidden = await server.inject({
    method: "POST",
    url: "/api/v1/feedback/reviews/review_01/rate",
    payload: { stars: 5 }
  });
  assert.equal(forbidden.statusCode, 401);

  const ok = await server.inject({
    method: "POST",
    url: "/api/v1/feedback/reviews/review_01/rate",
    headers: { authorization: "Bearer sess_1" },
    payload: { stars: 5 }
  });
  assert.equal(ok.statusCode, 200);
  assert.equal(urls[0], "http://feedback-svc/internal/reviews/review_01/rate");
  assert.equal(headers[0]?.["x-auth-user-id"], "writer_01");
});

test("GET /api/v1/feedback/reviews/:reviewId/rating proxies without auth", async (t) => {
  const urls: string[] = [];
  const server = buildServer({
    logger: false,
    requestFn: (async (url) => {
      urls.push(String(url));
      return jsonResponse({ rating: { stars: 4 } });
    }) as typeof request,
    feedbackExchangeBase: "http://feedback-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const response = await server.inject({
    method: "GET",
    url: "/api/v1/feedback/reviews/review_01/rating"
  });

  assert.equal(response.statusCode, 200);
  assert.equal(urls[0], "http://feedback-svc/internal/reviews/review_01/rating");
});

test("POST /api/v1/feedback/reviews/:reviewId/dispute requires auth", async (t) => {
  const urls: string[] = [];
  const headers: Record<string, string>[] = [];
  const server = buildServer({
    logger: false,
    requestFn: (async (url, options) => {
      const urlStr = String(url);
      if (urlStr.includes("/internal/auth/me")) {
        return jsonResponse({
          user: { id: "writer_01", email: "writer@example.com", displayName: "Writer One" },
          expiresAt: "2026-12-31T00:00:00.000Z"
        });
      }
      urls.push(urlStr);
      headers.push((options?.headers as Record<string, string> | undefined) ?? {});
      return jsonResponse({ dispute: { id: "dispute_01" } }, 201);
    }) as typeof request,
    identityServiceBase: "http://identity-svc",
    feedbackExchangeBase: "http://feedback-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const forbidden = await server.inject({
    method: "POST",
    url: "/api/v1/feedback/reviews/review_01/dispute",
    payload: { reason: "Low quality feedback" }
  });
  assert.equal(forbidden.statusCode, 401);

  const ok = await server.inject({
    method: "POST",
    url: "/api/v1/feedback/reviews/review_01/dispute",
    headers: { authorization: "Bearer sess_1" },
    payload: { reason: "Low quality feedback" }
  });
  assert.equal(ok.statusCode, 201);
  assert.equal(urls[0], "http://feedback-svc/internal/reviews/review_01/dispute");
  assert.equal(headers[0]?.["x-auth-user-id"], "writer_01");
});

test("GET /api/v1/feedback/reputation/:userId proxies without auth", async (t) => {
  const urls: string[] = [];
  const server = buildServer({
    logger: false,
    requestFn: (async (url) => {
      urls.push(String(url));
      return jsonResponse({ userId: "writer_01", score: 4.8, totalReviews: 15 });
    }) as typeof request,
    feedbackExchangeBase: "http://feedback-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const response = await server.inject({
    method: "GET",
    url: "/api/v1/feedback/reputation/writer_01"
  });

  assert.equal(response.statusCode, 200);
  assert.equal(urls[0], "http://feedback-svc/internal/reputation/writer_01");
});

test("GET /api/v1/feedback/disputes requires auth and proxies query params", async (t) => {
  const urls: string[] = [];
  const headers: Record<string, string>[] = [];
  const server = buildServer({
    logger: false,
    requestFn: (async (url, options) => {
      const urlStr = String(url);
      if (urlStr.includes("/internal/auth/me")) {
        return jsonResponse({
          user: { id: "writer_01", email: "writer@example.com", displayName: "Writer One" },
          expiresAt: "2026-12-31T00:00:00.000Z"
        });
      }
      urls.push(urlStr);
      headers.push((options?.headers as Record<string, string> | undefined) ?? {});
      return jsonResponse({ disputes: [] });
    }) as typeof request,
    identityServiceBase: "http://identity-svc",
    feedbackExchangeBase: "http://feedback-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const forbidden = await server.inject({
    method: "GET",
    url: "/api/v1/feedback/disputes?status=open"
  });
  assert.equal(forbidden.statusCode, 401);

  const ok = await server.inject({
    method: "GET",
    url: "/api/v1/feedback/disputes?status=open",
    headers: { authorization: "Bearer sess_1" }
  });
  assert.equal(ok.statusCode, 200);
  assert.equal(urls[0], "http://feedback-svc/internal/disputes?status=open");
  assert.equal(headers[0]?.["x-auth-user-id"], "writer_01");
});

test("POST /api/v1/feedback/disputes/:disputeId/resolve requires auth", async (t) => {
  const urls: string[] = [];
  const headers: Record<string, string>[] = [];
  const server = buildServer({
    logger: false,
    requestFn: (async (url, options) => {
      const urlStr = String(url);
      if (urlStr.includes("/internal/auth/me")) {
        return jsonResponse({
          user: { id: "admin_01", email: "admin@example.com", displayName: "Admin One" },
          expiresAt: "2026-12-31T00:00:00.000Z"
        });
      }
      urls.push(urlStr);
      headers.push((options?.headers as Record<string, string> | undefined) ?? {});
      return jsonResponse({ dispute: { id: "dispute_01", status: "resolved" } });
    }) as typeof request,
    identityServiceBase: "http://identity-svc",
    feedbackExchangeBase: "http://feedback-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const forbidden = await server.inject({
    method: "POST",
    url: "/api/v1/feedback/disputes/dispute_01/resolve",
    payload: { resolution: "refund_tokens", notes: "Valid dispute" }
  });
  assert.equal(forbidden.statusCode, 401);

  const ok = await server.inject({
    method: "POST",
    url: "/api/v1/feedback/disputes/dispute_01/resolve",
    headers: { authorization: "Bearer sess_1" },
    payload: { resolution: "refund_tokens", notes: "Valid dispute" }
  });
  assert.equal(ok.statusCode, 200);
  assert.equal(urls[0], "http://feedback-svc/internal/disputes/dispute_01/resolve");
  assert.equal(headers[0]?.["x-auth-user-id"], "admin_01");
});
