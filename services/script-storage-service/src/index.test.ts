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

test("script storage registers and views script as owner", async (t) => {
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
  assert.equal(payload.access.isOwner, true);
  assert.equal(payload.scriptId, "script_abc");
});

test("private script denies unauthenticated viewers", async (t) => {
  const server = buildServer({ logger: false });
  t.after(async () => {
    await server.close();
  });

  await server.inject({
    method: "POST",
    url: "/internal/scripts/register",
    payload: {
      scriptId: "script_priv",
      ownerUserId: "writer_01",
      objectKey: "writer_01/script_priv/latest.pdf",
      filename: "script.pdf",
      contentType: "application/pdf",
      size: 5000
    }
  });

  // Unauthenticated viewer (no viewerUserId)
  const unauthResponse = await server.inject({
    method: "GET",
    url: "/internal/scripts/script_priv/view"
  });
  assert.equal(unauthResponse.statusCode, 200);
  assert.equal(unauthResponse.json().access.canView, false);

  // Non-owner viewer
  const nonOwnerResponse = await server.inject({
    method: "GET",
    url: "/internal/scripts/script_priv/view?viewerUserId=writer_02"
  });
  assert.equal(nonOwnerResponse.statusCode, 200);
  assert.equal(nonOwnerResponse.json().access.canView, false);
});

test("public script allows anyone to view", async (t) => {
  const server = buildServer({ logger: false });
  t.after(async () => {
    await server.close();
  });

  await server.inject({
    method: "POST",
    url: "/internal/scripts/register",
    payload: {
      scriptId: "script_pub",
      ownerUserId: "writer_01",
      objectKey: "writer_01/script_pub/latest.pdf",
      filename: "script.pdf",
      contentType: "application/pdf",
      size: 5000
    }
  });

  // Set visibility to public
  const patchResponse = await server.inject({
    method: "PATCH",
    url: "/internal/scripts/script_pub/visibility",
    payload: { visibility: "public", ownerUserId: "writer_01" }
  });
  assert.equal(patchResponse.statusCode, 200);
  assert.equal(patchResponse.json().visibility, "public");

  // Unauthenticated can view
  const viewResponse = await server.inject({
    method: "GET",
    url: "/internal/scripts/script_pub/view"
  });
  assert.equal(viewResponse.statusCode, 200);
  assert.equal(viewResponse.json().access.canView, true);
});

test("visibility change requires owner", async (t) => {
  const server = buildServer({ logger: false });
  t.after(async () => {
    await server.close();
  });

  await server.inject({
    method: "POST",
    url: "/internal/scripts/register",
    payload: {
      scriptId: "script_own",
      ownerUserId: "writer_01",
      objectKey: "writer_01/script_own/latest.pdf",
      filename: "script.pdf",
      contentType: "application/pdf",
      size: 5000
    }
  });

  const forbiddenResponse = await server.inject({
    method: "PATCH",
    url: "/internal/scripts/script_own/visibility",
    payload: { visibility: "public", ownerUserId: "writer_02" }
  });
  assert.equal(forbiddenResponse.statusCode, 403);
});

test("approved_only script respects approved viewers", async (t) => {
  const server = buildServer({ logger: false });
  t.after(async () => {
    await server.close();
  });

  // The demo script (script_demo_01) is pre-seeded with writer_01 as owner
  // Set it to approved_only
  const patchResponse = await server.inject({
    method: "PATCH",
    url: "/internal/scripts/script_demo_01/visibility",
    payload: { visibility: "approved_only", ownerUserId: "writer_01" }
  });
  assert.equal(patchResponse.statusCode, 200);

  // Non-approved viewer cannot view
  const nonApprovedResponse = await server.inject({
    method: "GET",
    url: "/internal/scripts/script_demo_01/view?viewerUserId=writer_02"
  });
  assert.equal(nonApprovedResponse.statusCode, 200);
  assert.equal(nonApprovedResponse.json().access.canView, false);

  // Owner can still view
  const ownerResponse = await server.inject({
    method: "GET",
    url: "/internal/scripts/script_demo_01/view?viewerUserId=writer_01"
  });
  assert.equal(ownerResponse.statusCode, 200);
  assert.equal(ownerResponse.json().access.canView, true);
});
