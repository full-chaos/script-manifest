import assert from "node:assert/strict";
import test from "node:test";
import { buildServer } from "./index.js";

test("script storage creates upload session", async (t) => {
  const server = buildServer({ logger: false });
  t.after(async () => {
    await server.close();
  });

  const response = await server.inject({
    method: "POST",
    url: "/internal/scripts/upload-session",
    payload: {
      scriptId: "script_01",
      ownerUserId: "writer_01",
      filename: "My Draft.pdf",
      contentType: "application/pdf",
      size: 1024
    }
  });

  assert.equal(response.statusCode, 201);
  const payload = response.json();
  assert.equal(payload.bucket, "scripts");
  assert.match(payload.objectKey, /writer_01\/script_01/);
});

test("script storage registers and views script", async (t) => {
  const server = buildServer({ logger: false });
  t.after(async () => {
    await server.close();
  });

  await server.inject({
    method: "POST",
    url: "/internal/scripts/register",
    payload: {
      scriptId: "script_abc",
      ownerUserId: "writer_01",
      objectKey: "writer_01/script_abc/latest.pdf",
      filename: "script.pdf",
      contentType: "application/pdf",
      size: 5000
    }
  });

  const viewResponse = await server.inject({
    method: "GET",
    url: "/internal/scripts/script_abc/view?viewerUserId=writer_01"
  });

  assert.equal(viewResponse.statusCode, 200);
  const payload = viewResponse.json();
  assert.equal(payload.access.canView, true);
  assert.equal(payload.scriptId, "script_abc");
});
