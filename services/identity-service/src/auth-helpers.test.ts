import assert from "node:assert/strict";
import test from "node:test";
import { makeServiceHeaders } from "@script-manifest/service-utils";
import { readAdminUserId, readServiceRole, requireAdmin } from "./auth-helpers.js";

const ORIGINAL_SECRET = process.env.SERVICE_TOKEN_SECRET;

test.afterEach(() => {
  if (ORIGINAL_SECRET === undefined) {
    delete process.env.SERVICE_TOKEN_SECRET;
  } else {
    process.env.SERVICE_TOKEN_SECRET = ORIGINAL_SECRET;
  }
});

test("readAdminUserId returns x-auth-user-id when present", () => {
  const userId = readAdminUserId({ "x-auth-user-id": "admin_1" });
  assert.equal(userId, "admin_1");
});

test("readAdminUserId returns null for invalid values", () => {
  assert.equal(readAdminUserId({}), null);
  assert.equal(readAdminUserId({ "x-auth-user-id": "" }), null);
  assert.equal(readAdminUserId({ "x-auth-user-id": 42 }), null);
});

test("readServiceRole returns token role when service token is valid", () => {
  process.env.SERVICE_TOKEN_SECRET = "test-secret";
  const headers = makeServiceHeaders("svc_user", "admin");

  assert.equal(readServiceRole(headers), "admin");
});

test("readServiceRole returns null without a valid service token", () => {
  delete process.env.SERVICE_TOKEN_SECRET;
  assert.equal(readServiceRole({}), null);
});

test("requireAdmin returns x-auth-user-id when admin token is valid", () => {
  process.env.SERVICE_TOKEN_SECRET = "test-secret";
  const headers = makeServiceHeaders("svc_admin", "admin", { "x-auth-user-id": "admin_42" });

  assert.equal(requireAdmin(headers), "admin_42");
});

test("requireAdmin falls back to token subject when x-auth-user-id is missing", () => {
  process.env.SERVICE_TOKEN_SECRET = "test-secret";
  const headers = makeServiceHeaders("svc_admin", "admin");

  assert.equal(requireAdmin(headers), "svc_admin");
});

test("requireAdmin returns null for non-admin service token", () => {
  process.env.SERVICE_TOKEN_SECRET = "test-secret";
  const headers = makeServiceHeaders("svc_writer", "writer", { "x-auth-user-id": "writer_1" });

  assert.equal(requireAdmin(headers), null);
});
