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

test("POST /api/v1/coverage/providers requires auth and proxies with user id", async (t) => {
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
      return jsonResponse({ provider: { id: "provider_01" } }, 201);
    }) as typeof request,
    identityServiceBase: "http://identity-svc",
    coverageMarketplaceBase: "http://coverage-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const forbidden = await server.inject({
    method: "POST",
    url: "/api/v1/coverage/providers",
    payload: { displayName: "Coverage Pro", genres: ["Drama"] }
  });
  assert.equal(forbidden.statusCode, 401);
  assert.equal(urls.length, 0);

  const ok = await server.inject({
    method: "POST",
    url: "/api/v1/coverage/providers",
    headers: { authorization: "Bearer sess_1" },
    payload: { displayName: "Coverage Pro", genres: ["Drama"] }
  });
  assert.equal(ok.statusCode, 201);
  assert.equal(urls[0], "http://coverage-svc/internal/providers");
  assert.equal(headers[0]?.["x-auth-user-id"], "writer_01");
});

test("GET /api/v1/coverage/providers proxies query params without auth", async (t) => {
  const urls: string[] = [];
  const server = buildServer({
    logger: false,
    requestFn: (async (url) => {
      urls.push(String(url));
      return jsonResponse({ providers: [] });
    }) as typeof request,
    coverageMarketplaceBase: "http://coverage-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const response = await server.inject({
    method: "GET",
    url: "/api/v1/coverage/providers?genre=Drama"
  });

  assert.equal(response.statusCode, 200);
  assert.equal(urls[0], "http://coverage-svc/internal/providers?genre=Drama");
});

test("GET /api/v1/coverage/providers/:providerId proxies to specific provider", async (t) => {
  const urls: string[] = [];
  const server = buildServer({
    logger: false,
    requestFn: (async (url) => {
      urls.push(String(url));
      return jsonResponse({ provider: { id: "provider_01" } });
    }) as typeof request,
    coverageMarketplaceBase: "http://coverage-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const response = await server.inject({
    method: "GET",
    url: "/api/v1/coverage/providers/provider_01"
  });

  assert.equal(response.statusCode, 200);
  assert.equal(urls[0], "http://coverage-svc/internal/providers/provider_01");
});

test("PATCH /api/v1/coverage/providers/:providerId requires auth and proxies with user id", async (t) => {
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
      return jsonResponse({ provider: { id: "provider_01", displayName: "Updated Pro" } });
    }) as typeof request,
    identityServiceBase: "http://identity-svc",
    coverageMarketplaceBase: "http://coverage-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const forbidden = await server.inject({
    method: "PATCH",
    url: "/api/v1/coverage/providers/provider_01",
    payload: { displayName: "Updated Pro" }
  });
  assert.equal(forbidden.statusCode, 401);

  const ok = await server.inject({
    method: "PATCH",
    url: "/api/v1/coverage/providers/provider_01",
    headers: { authorization: "Bearer sess_1" },
    payload: { displayName: "Updated Pro" }
  });
  assert.equal(ok.statusCode, 200);
  assert.equal(urls[0], "http://coverage-svc/internal/providers/provider_01");
  assert.equal(headers[0]?.["x-auth-user-id"], "writer_01");
});

test("GET /api/v1/coverage/providers/:providerId/stripe-onboarding requires auth", async (t) => {
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
      return jsonResponse({ url: "https://stripe.com/onboarding" });
    }) as typeof request,
    identityServiceBase: "http://identity-svc",
    coverageMarketplaceBase: "http://coverage-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const forbidden = await server.inject({
    method: "GET",
    url: "/api/v1/coverage/providers/provider_01/stripe-onboarding"
  });
  assert.equal(forbidden.statusCode, 401);

  const ok = await server.inject({
    method: "GET",
    url: "/api/v1/coverage/providers/provider_01/stripe-onboarding",
    headers: { authorization: "Bearer sess_1" }
  });
  assert.equal(ok.statusCode, 200);
  assert.equal(urls[0], "http://coverage-svc/internal/providers/provider_01/stripe-onboarding");
  assert.equal(headers[0]?.["x-auth-user-id"], "writer_01");
});

test("POST /api/v1/coverage/providers/:providerId/services requires auth", async (t) => {
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
      return jsonResponse({ service: { id: "service_01" } }, 201);
    }) as typeof request,
    identityServiceBase: "http://identity-svc",
    coverageMarketplaceBase: "http://coverage-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const forbidden = await server.inject({
    method: "POST",
    url: "/api/v1/coverage/providers/provider_01/services",
    payload: { name: "Basic Coverage", priceInCents: 5000 }
  });
  assert.equal(forbidden.statusCode, 401);

  const ok = await server.inject({
    method: "POST",
    url: "/api/v1/coverage/providers/provider_01/services",
    headers: { authorization: "Bearer sess_1" },
    payload: { name: "Basic Coverage", priceInCents: 5000 }
  });
  assert.equal(ok.statusCode, 201);
  assert.equal(urls[0], "http://coverage-svc/internal/providers/provider_01/services");
  assert.equal(headers[0]?.["x-auth-user-id"], "writer_01");
});

test("GET /api/v1/coverage/providers/:providerId/services proxies without auth", async (t) => {
  const urls: string[] = [];
  const server = buildServer({
    logger: false,
    requestFn: (async (url) => {
      urls.push(String(url));
      return jsonResponse({ services: [] });
    }) as typeof request,
    coverageMarketplaceBase: "http://coverage-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const response = await server.inject({
    method: "GET",
    url: "/api/v1/coverage/providers/provider_01/services"
  });

  assert.equal(response.statusCode, 200);
  assert.equal(urls[0], "http://coverage-svc/internal/providers/provider_01/services");
});

test("GET /api/v1/coverage/services proxies query params without auth", async (t) => {
  const urls: string[] = [];
  const server = buildServer({
    logger: false,
    requestFn: (async (url) => {
      urls.push(String(url));
      return jsonResponse({ services: [] });
    }) as typeof request,
    coverageMarketplaceBase: "http://coverage-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const response = await server.inject({
    method: "GET",
    url: "/api/v1/coverage/services?genre=Drama&maxPrice=10000"
  });

  assert.equal(response.statusCode, 200);
  assert.equal(urls[0], "http://coverage-svc/internal/services?genre=Drama&maxPrice=10000");
});

test("PATCH /api/v1/coverage/services/:serviceId requires auth", async (t) => {
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
      return jsonResponse({ service: { id: "service_01", priceInCents: 7500 } });
    }) as typeof request,
    identityServiceBase: "http://identity-svc",
    coverageMarketplaceBase: "http://coverage-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const forbidden = await server.inject({
    method: "PATCH",
    url: "/api/v1/coverage/services/service_01",
    payload: { priceInCents: 7500 }
  });
  assert.equal(forbidden.statusCode, 401);

  const ok = await server.inject({
    method: "PATCH",
    url: "/api/v1/coverage/services/service_01",
    headers: { authorization: "Bearer sess_1" },
    payload: { priceInCents: 7500 }
  });
  assert.equal(ok.statusCode, 200);
  assert.equal(urls[0], "http://coverage-svc/internal/services/service_01");
  assert.equal(headers[0]?.["x-auth-user-id"], "writer_01");
});

test("POST /api/v1/coverage/orders requires auth and proxies with user id", async (t) => {
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
      return jsonResponse({ order: { id: "order_01" } }, 201);
    }) as typeof request,
    identityServiceBase: "http://identity-svc",
    coverageMarketplaceBase: "http://coverage-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const forbidden = await server.inject({
    method: "POST",
    url: "/api/v1/coverage/orders",
    payload: { serviceId: "service_01", scriptId: "script_01" }
  });
  assert.equal(forbidden.statusCode, 401);

  const ok = await server.inject({
    method: "POST",
    url: "/api/v1/coverage/orders",
    headers: { authorization: "Bearer sess_1" },
    payload: { serviceId: "service_01", scriptId: "script_01" }
  });
  assert.equal(ok.statusCode, 201);
  assert.equal(urls[0], "http://coverage-svc/internal/orders");
  assert.equal(headers[0]?.["x-auth-user-id"], "writer_01");
});

test("GET /api/v1/coverage/orders requires auth and proxies query params", async (t) => {
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
      return jsonResponse({ orders: [] });
    }) as typeof request,
    identityServiceBase: "http://identity-svc",
    coverageMarketplaceBase: "http://coverage-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const forbidden = await server.inject({
    method: "GET",
    url: "/api/v1/coverage/orders?status=pending"
  });
  assert.equal(forbidden.statusCode, 401);

  const ok = await server.inject({
    method: "GET",
    url: "/api/v1/coverage/orders?status=pending",
    headers: { authorization: "Bearer sess_1" }
  });
  assert.equal(ok.statusCode, 200);
  assert.equal(urls[0], "http://coverage-svc/internal/orders?status=pending");
  assert.equal(headers[0]?.["x-auth-user-id"], "writer_01");
});

test("GET /api/v1/coverage/orders/:orderId requires auth and proxies to specific order", async (t) => {
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
      return jsonResponse({ order: { id: "order_01" } });
    }) as typeof request,
    identityServiceBase: "http://identity-svc",
    coverageMarketplaceBase: "http://coverage-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const forbidden = await server.inject({
    method: "GET",
    url: "/api/v1/coverage/orders/order_01"
  });
  assert.equal(forbidden.statusCode, 401);

  const ok = await server.inject({
    method: "GET",
    url: "/api/v1/coverage/orders/order_01",
    headers: { authorization: "Bearer sess_1" }
  });
  assert.equal(ok.statusCode, 200);
  assert.equal(urls[0], "http://coverage-svc/internal/orders/order_01");
  assert.equal(headers[0]?.["x-auth-user-id"], "writer_01");
});

test("order action routes (claim, complete, cancel) require auth and proxy to action endpoint", async (t) => {
  const urls: string[] = [];
  const headers: Record<string, string>[] = [];
  const server = buildServer({
    logger: false,
    requestFn: (async (url, options) => {
      const urlStr = String(url);
      if (urlStr.includes("/internal/auth/me")) {
        return jsonResponse({
          user: { id: "provider_01", email: "provider@example.com", displayName: "Provider One" },
          expiresAt: "2026-12-31T00:00:00.000Z"
        });
      }
      urls.push(urlStr);
      headers.push((options?.headers as Record<string, string> | undefined) ?? {});
      return jsonResponse({ order: { id: "order_01" } });
    }) as typeof request,
    identityServiceBase: "http://identity-svc",
    coverageMarketplaceBase: "http://coverage-svc"
  });
  t.after(async () => {
    await server.close();
  });

  for (const action of ["claim", "complete", "cancel"]) {
    const forbidden = await server.inject({
      method: "POST",
      url: `/api/v1/coverage/orders/order_01/${action}`
    });
    assert.equal(forbidden.statusCode, 401, `${action} should require auth`);
  }
  assert.equal(urls.length, 0);

  for (const action of ["claim", "complete", "cancel"]) {
    const ok = await server.inject({
      method: "POST",
      url: `/api/v1/coverage/orders/order_01/${action}`,
      headers: { authorization: "Bearer sess_1" }
    });
    assert.equal(ok.statusCode, 200, `${action} should succeed with auth`);
  }

  assert.equal(urls[0], "http://coverage-svc/internal/orders/order_01/claim");
  assert.equal(urls[1], "http://coverage-svc/internal/orders/order_01/complete");
  assert.equal(urls[2], "http://coverage-svc/internal/orders/order_01/cancel");
  assert.equal(headers[0]?.["x-auth-user-id"], "provider_01");
});

test("POST /api/v1/coverage/orders/:orderId/deliver requires auth and sends body", async (t) => {
  const urls: string[] = [];
  const headers: Record<string, string>[] = [];
  const server = buildServer({
    logger: false,
    requestFn: (async (url, options) => {
      const urlStr = String(url);
      if (urlStr.includes("/internal/auth/me")) {
        return jsonResponse({
          user: { id: "provider_01", email: "provider@example.com", displayName: "Provider One" },
          expiresAt: "2026-12-31T00:00:00.000Z"
        });
      }
      urls.push(urlStr);
      headers.push((options?.headers as Record<string, string> | undefined) ?? {});
      return jsonResponse({ order: { id: "order_01", status: "delivered" } });
    }) as typeof request,
    identityServiceBase: "http://identity-svc",
    coverageMarketplaceBase: "http://coverage-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const forbidden = await server.inject({
    method: "POST",
    url: "/api/v1/coverage/orders/order_01/deliver",
    payload: { coverageFileUrl: "https://example.com/coverage.pdf" }
  });
  assert.equal(forbidden.statusCode, 401);

  const ok = await server.inject({
    method: "POST",
    url: "/api/v1/coverage/orders/order_01/deliver",
    headers: { authorization: "Bearer sess_1" },
    payload: { coverageFileUrl: "https://example.com/coverage.pdf" }
  });
  assert.equal(ok.statusCode, 200);
  assert.equal(urls[0], "http://coverage-svc/internal/orders/order_01/deliver");
  assert.equal(headers[0]?.["x-auth-user-id"], "provider_01");
  assert.equal(headers[0]?.["content-type"], "application/json");
});

test("GET /api/v1/coverage/orders/:orderId/delivery requires auth", async (t) => {
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
      return jsonResponse({ delivery: { fileUrl: "https://example.com/coverage.pdf" } });
    }) as typeof request,
    identityServiceBase: "http://identity-svc",
    coverageMarketplaceBase: "http://coverage-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const forbidden = await server.inject({
    method: "GET",
    url: "/api/v1/coverage/orders/order_01/delivery"
  });
  assert.equal(forbidden.statusCode, 401);

  const ok = await server.inject({
    method: "GET",
    url: "/api/v1/coverage/orders/order_01/delivery",
    headers: { authorization: "Bearer sess_1" }
  });
  assert.equal(ok.statusCode, 200);
  assert.equal(urls[0], "http://coverage-svc/internal/orders/order_01/delivery");
  assert.equal(headers[0]?.["x-auth-user-id"], "writer_01");
});

test("GET /api/v1/coverage/orders/:orderId/delivery/upload-url requires auth", async (t) => {
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
      return jsonResponse({ uploadUrl: "https://example.com/upload" });
    }) as typeof request,
    identityServiceBase: "http://identity-svc",
    coverageMarketplaceBase: "http://coverage-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const forbidden = await server.inject({
    method: "GET",
    url: "/api/v1/coverage/orders/order_01/delivery/upload-url"
  });
  assert.equal(forbidden.statusCode, 401);

  const ok = await server.inject({
    method: "GET",
    url: "/api/v1/coverage/orders/order_01/delivery/upload-url",
    headers: { authorization: "Bearer sess_1" }
  });
  assert.equal(ok.statusCode, 200);
  assert.equal(urls[0], "http://coverage-svc/internal/orders/order_01/delivery/upload-url");
  assert.equal(headers[0]?.["x-auth-user-id"], "writer_01");
});

test("POST /api/v1/coverage/orders/:orderId/review requires auth", async (t) => {
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
      return jsonResponse({ review: { id: "review_01" } }, 201);
    }) as typeof request,
    identityServiceBase: "http://identity-svc",
    coverageMarketplaceBase: "http://coverage-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const forbidden = await server.inject({
    method: "POST",
    url: "/api/v1/coverage/orders/order_01/review",
    payload: { stars: 5, comments: "Excellent coverage" }
  });
  assert.equal(forbidden.statusCode, 401);

  const ok = await server.inject({
    method: "POST",
    url: "/api/v1/coverage/orders/order_01/review",
    headers: { authorization: "Bearer sess_1" },
    payload: { stars: 5, comments: "Excellent coverage" }
  });
  assert.equal(ok.statusCode, 201);
  assert.equal(urls[0], "http://coverage-svc/internal/orders/order_01/review");
  assert.equal(headers[0]?.["x-auth-user-id"], "writer_01");
});

test("GET /api/v1/coverage/providers/:providerId/reviews proxies without auth", async (t) => {
  const urls: string[] = [];
  const server = buildServer({
    logger: false,
    requestFn: (async (url) => {
      urls.push(String(url));
      return jsonResponse({ reviews: [] });
    }) as typeof request,
    coverageMarketplaceBase: "http://coverage-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const response = await server.inject({
    method: "GET",
    url: "/api/v1/coverage/providers/provider_01/reviews"
  });

  assert.equal(response.statusCode, 200);
  assert.equal(urls[0], "http://coverage-svc/internal/providers/provider_01/reviews");
});

test("POST /api/v1/coverage/orders/:orderId/dispute requires auth", async (t) => {
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
    coverageMarketplaceBase: "http://coverage-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const forbidden = await server.inject({
    method: "POST",
    url: "/api/v1/coverage/orders/order_01/dispute",
    payload: { reason: "Coverage was not delivered" }
  });
  assert.equal(forbidden.statusCode, 401);

  const ok = await server.inject({
    method: "POST",
    url: "/api/v1/coverage/orders/order_01/dispute",
    headers: { authorization: "Bearer sess_1" },
    payload: { reason: "Coverage was not delivered" }
  });
  assert.equal(ok.statusCode, 201);
  assert.equal(urls[0], "http://coverage-svc/internal/orders/order_01/dispute");
  assert.equal(headers[0]?.["x-auth-user-id"], "writer_01");
});

test("GET /api/v1/coverage/disputes requires allowlisted admin", async (t) => {
  const urls: string[] = [];
  const headers: Record<string, string>[] = [];
  const server = buildServer({
    logger: false,
    coverageAdminAllowlist: ["admin_01"],
    requestFn: (async (url, options) => {
      urls.push(String(url));
      headers.push((options?.headers as Record<string, string> | undefined) ?? {});
      return jsonResponse({ disputes: [] });
    }) as typeof request,
    coverageMarketplaceBase: "http://coverage-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const forbidden = await server.inject({
    method: "GET",
    url: "/api/v1/coverage/disputes?status=open"
  });
  assert.equal(forbidden.statusCode, 403);
  assert.equal(urls.length, 0);

  const ok = await server.inject({
    method: "GET",
    url: "/api/v1/coverage/disputes?status=open",
    headers: { "x-admin-user-id": "admin_01" }
  });
  assert.equal(ok.statusCode, 200);
  assert.equal(urls[0], "http://coverage-svc/internal/disputes?status=open");
  assert.equal(headers[0]?.["x-auth-user-id"], "admin_01");
});

test("PATCH /api/v1/coverage/disputes/:disputeId requires allowlisted admin", async (t) => {
  const urls: string[] = [];
  const headers: Record<string, string>[] = [];
  const server = buildServer({
    logger: false,
    coverageAdminAllowlist: ["admin_01"],
    requestFn: (async (url, options) => {
      urls.push(String(url));
      headers.push((options?.headers as Record<string, string> | undefined) ?? {});
      return jsonResponse({ dispute: { id: "dispute_01", status: "resolved" } });
    }) as typeof request,
    coverageMarketplaceBase: "http://coverage-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const forbidden = await server.inject({
    method: "PATCH",
    url: "/api/v1/coverage/disputes/dispute_01",
    payload: { resolution: "refund", notes: "Provider failed to deliver" }
  });
  assert.equal(forbidden.statusCode, 403);
  assert.equal(urls.length, 0);

  const ok = await server.inject({
    method: "PATCH",
    url: "/api/v1/coverage/disputes/dispute_01",
    headers: { "x-admin-user-id": "admin_01" },
    payload: { resolution: "refund", notes: "Provider failed to deliver" }
  });
  assert.equal(ok.statusCode, 200);
  assert.equal(urls[0], "http://coverage-svc/internal/disputes/dispute_01");
  assert.equal(headers[0]?.["x-auth-user-id"], "admin_01");
});

test("GET /api/v1/coverage/admin/providers/review-queue requires allowlisted admin", async (t) => {
  const urls: string[] = [];
  const headers: Record<string, string>[] = [];
  const server = buildServer({
    logger: false,
    coverageAdminAllowlist: ["admin_01"],
    requestFn: (async (url, options) => {
      urls.push(String(url));
      headers.push((options?.headers as Record<string, string> | undefined) ?? {});
      return jsonResponse({ entries: [] });
    }) as typeof request,
    coverageMarketplaceBase: "http://coverage-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const forbidden = await server.inject({
    method: "GET",
    url: "/api/v1/coverage/admin/providers/review-queue"
  });
  assert.equal(forbidden.statusCode, 403);

  const ok = await server.inject({
    method: "GET",
    url: "/api/v1/coverage/admin/providers/review-queue",
    headers: { "x-admin-user-id": "admin_01" }
  });
  assert.equal(ok.statusCode, 200);
  assert.equal(urls[0], "http://coverage-svc/internal/admin/providers/review-queue");
  assert.equal(headers[0]?.["x-auth-user-id"], "admin_01");
});

test("GET /api/v1/coverage/providers/:providerId/earnings-statement requires auth", async (t) => {
  const urls: string[] = [];
  const headers: Record<string, string>[] = [];
  const server = buildServer({
    logger: false,
    requestFn: (async (url, options) => {
      const urlStr = String(url);
      if (urlStr.includes("/internal/auth/me")) {
        return jsonResponse({
          user: { id: "provider_01", email: "provider@example.com", displayName: "Provider One" },
          expiresAt: "2026-12-31T00:00:00.000Z"
        });
      }
      urls.push(urlStr);
      headers.push((options?.headers as Record<string, string> | undefined) ?? {});
      return jsonResponse({ month: "2026-02", rows: [] });
    }) as typeof request,
    identityServiceBase: "http://identity-svc",
    coverageMarketplaceBase: "http://coverage-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const forbidden = await server.inject({
    method: "GET",
    url: "/api/v1/coverage/providers/provider_01/earnings-statement?month=2026-02"
  });
  assert.equal(forbidden.statusCode, 401);

  const ok = await server.inject({
    method: "GET",
    url: "/api/v1/coverage/providers/provider_01/earnings-statement?month=2026-02",
    headers: { authorization: "Bearer sess_provider" }
  });
  assert.equal(ok.statusCode, 200);
  assert.equal(urls[0], "http://coverage-svc/internal/providers/provider_01/earnings-statement?month=2026-02");
  assert.equal(headers[0]?.["x-auth-user-id"], "provider_01");
});

test("admin payout-ledger and SLA maintenance routes require allowlisted admin", async (t) => {
  const urls: string[] = [];
  const headers: Record<string, string>[] = [];
  const server = buildServer({
    logger: false,
    coverageAdminAllowlist: ["admin_01"],
    requestFn: (async (url, options) => {
      urls.push(String(url));
      headers.push((options?.headers as Record<string, string> | undefined) ?? {});
      return jsonResponse({ ok: true });
    }) as typeof request,
    coverageMarketplaceBase: "http://coverage-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const forbiddenLedger = await server.inject({
    method: "GET",
    url: "/api/v1/coverage/admin/payout-ledger"
  });
  assert.equal(forbiddenLedger.statusCode, 403);

  const ledgerOk = await server.inject({
    method: "GET",
    url: "/api/v1/coverage/admin/payout-ledger?month=2026-02",
    headers: { "x-admin-user-id": "admin_01" }
  });
  assert.equal(ledgerOk.statusCode, 200);
  assert.equal(urls[0], "http://coverage-svc/internal/admin/payout-ledger?month=2026-02");
  assert.equal(headers[0]?.["x-auth-user-id"], "admin_01");

  const jobOk = await server.inject({
    method: "POST",
    url: "/api/v1/coverage/admin/jobs/sla-maintenance",
    headers: { "x-admin-user-id": "admin_01" }
  });
  assert.equal(jobOk.statusCode, 200);
  assert.equal(urls[1], "http://coverage-svc/internal/jobs/sla-maintenance");
  assert.equal(headers[1]?.["x-auth-user-id"], "admin_01");
});

test("GET /api/v1/coverage/disputes/:disputeId/events requires allowlisted admin", async (t) => {
  const urls: string[] = [];
  const headers: Record<string, string>[] = [];
  const server = buildServer({
    logger: false,
    coverageAdminAllowlist: ["admin_01"],
    requestFn: (async (url, options) => {
      urls.push(String(url));
      headers.push((options?.headers as Record<string, string> | undefined) ?? {});
      return jsonResponse({ events: [] });
    }) as typeof request,
    coverageMarketplaceBase: "http://coverage-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const forbidden = await server.inject({
    method: "GET",
    url: "/api/v1/coverage/disputes/dispute_01/events"
  });
  assert.equal(forbidden.statusCode, 403);

  const ok = await server.inject({
    method: "GET",
    url: "/api/v1/coverage/disputes/dispute_01/events",
    headers: { "x-admin-user-id": "admin_01" }
  });
  assert.equal(ok.statusCode, 200);
  assert.equal(urls[0], "http://coverage-svc/internal/disputes/dispute_01/events");
  assert.equal(headers[0]?.["x-auth-user-id"], "admin_01");
});

test("POST /api/v1/coverage/stripe-webhook proxies without auth and forwards stripe-signature", async (t) => {
  const urls: string[] = [];
  const headers: Record<string, string>[] = [];
  const bodies: unknown[] = [];
  const server = buildServer({
    logger: false,
    requestFn: (async (url, options) => {
      urls.push(String(url));
      headers.push((options?.headers as Record<string, string> | undefined) ?? {});
      bodies.push(options?.body);
      return jsonResponse({ received: true });
    }) as typeof request,
    coverageMarketplaceBase: "http://coverage-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const response = await server.inject({
    method: "POST",
    url: "/api/v1/coverage/stripe-webhook",
    headers: {
      "content-type": "application/json",
      "stripe-signature": "t=1234567890,v1=abc123"
    },
    payload: { type: "payment_intent.succeeded", data: {} }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(urls[0], "http://coverage-svc/internal/stripe-webhook");
  assert.equal(headers[0]?.["stripe-signature"], "t=1234567890,v1=abc123");
  assert.equal(
    bodies[0],
    JSON.stringify({ type: "payment_intent.succeeded", data: {} })
  );
});

test("POST /api/v1/coverage/stripe-webhook forwards raw string body", async (t) => {
  const bodies: unknown[] = [];
  const headers: Record<string, string>[] = [];
  const server = buildServer({
    logger: false,
    requestFn: (async (_url, options) => {
      bodies.push(options?.body);
      headers.push((options?.headers as Record<string, string> | undefined) ?? {});
      return jsonResponse({ received: true });
    }) as typeof request,
    coverageMarketplaceBase: "http://coverage-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const rawPayload = "{\"id\":\"evt_123\"}";
  const response = await server.inject({
    method: "POST",
    url: "/api/v1/coverage/stripe-webhook",
    headers: {
      "content-type": "text/plain",
      "stripe-signature": "t=1234567890,v1=rawstring"
    },
    payload: rawPayload
  });

  assert.equal(response.statusCode, 200);
  assert.equal(bodies[0], rawPayload);
  assert.equal(headers[0]?.["stripe-signature"], "t=1234567890,v1=rawstring");
  assert.equal(headers[0]?.["content-type"], "text/plain");
});

test("POST /api/v1/coverage/stripe-webhook forwards Buffer body when parser provides Buffer", async (t) => {
  const bodies: unknown[] = [];
  const server = buildServer({
    logger: false,
    requestFn: (async (_url, options) => {
      bodies.push(options?.body);
      return jsonResponse({ received: true });
    }) as typeof request,
    coverageMarketplaceBase: "http://coverage-svc"
  });
  server.addContentTypeParser(
    "application/octet-stream",
    { parseAs: "buffer" },
    (_req, body, done) => done(null, body)
  );
  t.after(async () => {
    await server.close();
  });

  const rawPayload = Buffer.from("{\"id\":\"evt_buffer\"}", "utf8");
  const response = await server.inject({
    method: "POST",
    url: "/api/v1/coverage/stripe-webhook",
    headers: {
      "content-type": "application/octet-stream",
      "stripe-signature": "t=1234567890,v1=buffer"
    },
    payload: rawPayload
  });

  assert.equal(response.statusCode, 200);
  assert.equal(Buffer.isBuffer(bodies[0]), true);
  assert.equal((bodies[0] as Buffer).toString("utf8"), rawPayload.toString("utf8"));
});
