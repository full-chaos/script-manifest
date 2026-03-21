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
      text: async () => JSON.stringify(payload),
      dump: async () => undefined
    }
  } as RequestResult;
}

test("projects routes proxy listing, project CRUD, co-writers, and drafts", async (t) => {
  const urls: string[] = [];
  const headers: Record<string, string>[] = [];
  const bodies: string[] = [];

  const server = await buildServer({
    logger: false,
    requestFn: (async (url, options) => {
      const urlStr = String(url);
      if (urlStr.includes("/internal/auth/me")) {
        return jsonResponse({
          user: { id: "writer_01", email: "writer@example.com", displayName: "Writer" },
          expiresAt: "2026-12-31T00:00:00.000Z"
        });
      }

      urls.push(urlStr);
      headers.push((options?.headers as Record<string, string> | undefined) ?? {});
      if (options?.body) {
        bodies.push(String(options.body));
      }
      return jsonResponse({ ok: true });
    }) as typeof request,
    identityServiceBase: "http://identity-svc",
    profileServiceBase: "http://profile-svc"
  });
  t.after(async () => {
    await server.close();
  });

  const list = await server.inject({
    method: "GET",
    url: "/api/v1/projects?genre=Drama&limit=10"
  });
  assert.equal(list.statusCode, 200);

  const unauthorizedCreate = await server.inject({
    method: "POST",
    url: "/api/v1/projects",
    headers: { "content-type": "application/json" },
    payload: {}
  });
  assert.equal(unauthorizedCreate.statusCode, 400);

  const invalidCreate = await server.inject({
    method: "POST",
    url: "/api/v1/projects",
    headers: {
      authorization: "Bearer sess_1",
      "content-type": "application/json"
    },
    payload: { title: "" }
  });
  assert.equal(invalidCreate.statusCode, 400);

  const create = await server.inject({
    method: "POST",
    url: "/api/v1/projects",
    headers: {
      authorization: "Bearer sess_1",
      "content-type": "application/json"
    },
    payload: {
      title: "Project One",
      format: "Feature",
      genre: "Drama",
      pageCount: 100,
      isDiscoverable: true
    }
  });
  assert.equal(create.statusCode, 200);

  const getOne = await server.inject({
    method: "GET",
    url: "/api/v1/projects/project 1"
  });
  assert.equal(getOne.statusCode, 200);

  const update = await server.inject({
    method: "PUT",
    url: "/api/v1/projects/project 1",
    headers: {
      authorization: "Bearer sess_1",
      "content-type": "application/json"
    },
    payload: { title: "Project Updated" }
  });
  assert.equal(update.statusCode, 200);

  const remove = await server.inject({
    method: "DELETE",
    url: "/api/v1/projects/project 1",
    headers: { authorization: "Bearer sess_1" }
  });
  assert.equal(remove.statusCode, 200);

  const listCoWriters = await server.inject({
    method: "GET",
    url: "/api/v1/projects/project 1/co-writers"
  });
  assert.equal(listCoWriters.statusCode, 200);

  const addCoWriter = await server.inject({
    method: "POST",
    url: "/api/v1/projects/project 1/co-writers",
    headers: {
      authorization: "Bearer sess_1",
      "content-type": "application/json"
    },
    payload: {
      coWriterUserId: "writer_02",
      creditOrder: 2
    }
  });
  assert.equal(addCoWriter.statusCode, 200);

  const removeCoWriter = await server.inject({
    method: "DELETE",
    url: "/api/v1/projects/project 1/co-writers/writer 02",
    headers: { authorization: "Bearer sess_1" }
  });
  assert.equal(removeCoWriter.statusCode, 200);

  const listDrafts = await server.inject({
    method: "GET",
    url: "/api/v1/projects/project 1/drafts"
  });
  assert.equal(listDrafts.statusCode, 200);

  const addDraft = await server.inject({
    method: "POST",
    url: "/api/v1/projects/project 1/drafts",
    headers: {
      authorization: "Bearer sess_1",
      "content-type": "application/json"
    },
    payload: {
      scriptId: "script_1",
      versionLabel: "v1",
      pageCount: 101,
      setPrimary: true
    }
  });
  assert.equal(addDraft.statusCode, 200);

  const patchDraft = await server.inject({
    method: "PATCH",
    url: "/api/v1/projects/project 1/drafts/draft 1",
    headers: {
      authorization: "Bearer sess_1",
      "content-type": "application/json"
    },
    payload: {
      versionLabel: "v2"
    }
  });
  assert.equal(patchDraft.statusCode, 200);

  const setPrimary = await server.inject({
    method: "POST",
    url: "/api/v1/projects/project 1/drafts/draft 1/primary",
    headers: {
      authorization: "Bearer sess_1",
      "content-type": "application/json"
    },
    payload: {}
  });
  assert.equal(setPrimary.statusCode, 200);

  assert.equal(urls[0], "http://profile-svc/internal/projects?genre=Drama&limit=10");
  assert.equal(urls[1], "http://profile-svc/internal/projects");
  assert.equal(urls[2], "http://profile-svc/internal/projects/project%201");
  assert.equal(urls[3], "http://profile-svc/internal/projects/project%201");
  assert.equal(urls[4], "http://profile-svc/internal/projects/project%201");
  assert.equal(urls[5], "http://profile-svc/internal/projects/project%201/co-writers");
  assert.equal(urls[6], "http://profile-svc/internal/projects/project%201/co-writers");
  assert.equal(
    urls[7],
    "http://profile-svc/internal/projects/project%201/co-writers/writer%2002"
  );
  assert.equal(urls[8], "http://profile-svc/internal/projects/project%201/drafts");
  assert.equal(urls[9], "http://profile-svc/internal/projects/project%201/drafts");
  assert.equal(urls[10], "http://profile-svc/internal/projects/project%201/drafts/draft%201");
  assert.equal(
    urls[11],
    "http://profile-svc/internal/projects/project%201/drafts/draft%201/primary"
  );
  assert.equal(headers[1]?.["x-auth-user-id"], "writer_01");
  assert.equal(headers[3]?.["x-auth-user-id"], "writer_01");
  assert.equal(headers[11]?.["x-auth-user-id"], "writer_01");
  assert.equal(JSON.parse(bodies[0] ?? "{}").title, "Project One");
});
