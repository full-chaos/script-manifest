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

test("industry account create proxies authenticated context", async (t) => {
  const urls: string[] = [];
  const authHeaders: string[] = [];
  const server = buildServer({
    logger: false,
    requestFn: (async (url, options) => {
      const urlStr = String(url);
      if (urlStr.includes("/internal/auth/me")) {
        return jsonResponse({
          user: { id: "industry_01", email: "exec@example.com", displayName: "Industry User" },
          expiresAt: "2026-12-31T00:00:00.000Z"
        });
      }

      urls.push(urlStr);
      authHeaders.push(
        (options?.headers as Record<string, string> | undefined)?.["x-auth-user-id"] ?? ""
      );
      return jsonResponse({ account: { id: "industry_account_1" } }, 201);
    }) as typeof request,
    identityServiceBase: "http://identity-svc",
    industryPortalBase: "http://industry-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const response = await server.inject({
    method: "POST",
    url: "/api/v1/industry/accounts",
    headers: { authorization: "Bearer sess_1" },
    payload: {
      companyName: "Studio One",
      roleTitle: "Manager",
      professionalEmail: "exec@example.com"
    }
  });

  assert.equal(response.statusCode, 201);
  assert.equal(urls[0], "http://industry-svc/internal/accounts");
  assert.equal(authHeaders[0], "industry_01");
});

test("industry verify route requires allowlisted admin", async (t) => {
  const urls: string[] = [];
  const adminHeaders: string[] = [];
  const server = buildServer({
    logger: false,
    industryAdminAllowlist: ["admin_writer"],
    requestFn: (async (url, options) => {
      urls.push(String(url));
      adminHeaders.push(
        (options?.headers as Record<string, string> | undefined)?.["x-admin-user-id"] ?? ""
      );
      return jsonResponse({ account: { id: "industry_account_1", verificationStatus: "verified" } });
    }) as typeof request,
    industryPortalBase: "http://industry-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const forbidden = await server.inject({
    method: "POST",
    url: "/api/v1/industry/accounts/industry_account_1/verify",
    payload: { status: "verified", verificationNotes: "ok" }
  });
  assert.equal(forbidden.statusCode, 403);
  assert.equal(urls.length, 0);

  const allowed = await server.inject({
    method: "POST",
    url: "/api/v1/industry/accounts/industry_account_1/verify",
    headers: { "x-admin-user-id": "admin_writer" },
    payload: { status: "verified", verificationNotes: "ok" }
  });
  assert.equal(allowed.statusCode, 200);
  assert.equal(urls[0], "http://industry-svc/internal/accounts/industry_account_1/verify");
  assert.equal(adminHeaders[0], "admin_writer");
});

test("industry entitlement check proxies query params", async (t) => {
  const urls: string[] = [];
  const server = buildServer({
    logger: false,
    requestFn: (async (url) => {
      urls.push(String(url));
      return jsonResponse({
        writerUserId: "writer_01",
        industryAccountId: "industry_account_1",
        accessLevel: "download",
        canView: true,
        canDownload: true
      });
    }) as typeof request,
    industryPortalBase: "http://industry-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const response = await server.inject({
    method: "GET",
    url: "/api/v1/industry/entitlements/writer_01/check?industryUserId=industry_01"
  });

  assert.equal(response.statusCode, 200);
  assert.equal(
    urls[0],
    "http://industry-svc/internal/entitlements/writer_01/check?industryUserId=industry_01"
  );
});

test("industry talent search resolves auth and forwards query", async (t) => {
  const urls: string[] = [];
  const headers: Record<string, string>[] = [];
  const server = buildServer({
    logger: false,
    requestFn: (async (url, options) => {
      const urlStr = String(url);
      if (urlStr.includes("/internal/auth/me")) {
        return jsonResponse({
          user: { id: "industry_01", email: "exec@example.com", displayName: "Industry User" },
          expiresAt: "2026-12-31T00:00:00.000Z"
        });
      }
      urls.push(urlStr);
      headers.push((options?.headers as Record<string, string> | undefined) ?? {});
      return jsonResponse({ results: [], total: 0, limit: 20, offset: 0 });
    }) as typeof request,
    identityServiceBase: "http://identity-svc",
    industryPortalBase: "http://industry-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const response = await server.inject({
    method: "GET",
    url: "/api/v1/industry/talent-search?genre=Drama&format=Feature",
    headers: { authorization: "Bearer sess_1" }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(
    urls[0],
    "http://industry-svc/internal/talent-search?genre=Drama&format=Feature"
  );
  assert.equal(headers[0]?.["x-auth-user-id"], "industry_01");
});

test("industry list routes proxy writer auth context", async (t) => {
  const urls: string[] = [];
  const headers: Record<string, string>[] = [];
  const server = buildServer({
    logger: false,
    requestFn: (async (url, options) => {
      const urlStr = String(url);
      if (urlStr.includes("/internal/auth/me")) {
        return jsonResponse({
          user: { id: "industry_01", email: "exec@example.com", displayName: "Industry User" },
          expiresAt: "2026-12-31T00:00:00.000Z"
        });
      }
      urls.push(urlStr);
      headers.push((options?.headers as Record<string, string> | undefined) ?? {});
      return jsonResponse({ list: { id: "industry_list_1" } }, 201);
    }) as typeof request,
    identityServiceBase: "http://identity-svc",
    industryPortalBase: "http://industry-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const response = await server.inject({
    method: "POST",
    url: "/api/v1/industry/lists/industry_list_1/items",
    headers: { authorization: "Bearer sess_1" },
    payload: { writerUserId: "writer_01", projectId: "project_01" }
  });

  assert.equal(response.statusCode, 201);
  assert.equal(urls[0], "http://industry-svc/internal/lists/industry_list_1/items");
  assert.equal(headers[0]?.["x-auth-user-id"], "industry_01");
});

test("industry mandate create route requires allowlisted admin", async (t) => {
  const urls: string[] = [];
  const headers: Record<string, string>[] = [];
  const server = buildServer({
    logger: false,
    industryAdminAllowlist: ["admin_writer"],
    requestFn: (async (url, options) => {
      urls.push(String(url));
      headers.push((options?.headers as Record<string, string> | undefined) ?? {});
      return jsonResponse({ mandate: { id: "mandate_1" } }, 201);
    }) as typeof request,
    industryPortalBase: "http://industry-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const forbidden = await server.inject({
    method: "POST",
    url: "/api/v1/industry/mandates",
    payload: {
      title: "Need contained thrillers",
      type: "mandate",
      description: "",
      format: "feature",
      genre: "thriller",
      opensAt: "2026-02-23T00:00:00.000Z",
      closesAt: "2026-03-23T00:00:00.000Z"
    }
  });
  assert.equal(forbidden.statusCode, 403);
  assert.equal(urls.length, 0);

  const ok = await server.inject({
    method: "POST",
    url: "/api/v1/industry/mandates",
    headers: { "x-admin-user-id": "admin_writer" },
    payload: {
      title: "Need contained thrillers",
      type: "mandate",
      description: "",
      format: "feature",
      genre: "thriller",
      opensAt: "2026-02-23T00:00:00.000Z",
      closesAt: "2026-03-23T00:00:00.000Z"
    }
  });
  assert.equal(ok.statusCode, 201);
  assert.equal(urls[0], "http://industry-svc/internal/mandates");
  assert.equal(headers[0]?.["x-admin-user-id"], "admin_writer");
});
