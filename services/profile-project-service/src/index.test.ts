import assert from "node:assert/strict";
import test from "node:test";
import type { NotificationEventEnvelope } from "@script-manifest/contracts";
import { buildServer } from "./index.js";

test("profile-project-service returns demo profile", async (t) => {
  const server = buildServer({ logger: false, publisher: async () => undefined });
  t.after(async () => {
    await server.close();
  });

  const response = await server.inject({ method: "GET", url: "/internal/profiles/writer_01" });
  assert.equal(response.statusCode, 200);
  const payload = response.json();
  assert.equal(payload.profile.id, "writer_01");
});

test("profile-project-service records access request and emits notification", async (t) => {
  const published: NotificationEventEnvelope[] = [];
  const server = buildServer({
    logger: false,
    publisher: async (event) => {
      published.push(event);
    }
  });
  t.after(async () => {
    await server.close();
  });

  const response = await server.inject({
    method: "POST",
    url: "/internal/scripts/script_123/access-requests",
    payload: {
      requesterUserId: "writer_02",
      ownerUserId: "writer_01"
    }
  });

  assert.equal(response.statusCode, 202);
  assert.equal(published.length, 1);
  assert.equal(published[0]?.eventType, "script_access_requested");
});

