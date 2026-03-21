import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { hasPermission, hasRole, ROLES, PERMISSIONS, type Role, type Permission } from "../src/rbac.js";

// ── hasPermission ───────────────────────────────────────────────────────────

describe("hasPermission", () => {
  it("grants profile:read to all roles", () => {
    for (const role of ROLES) {
      assert.ok(hasPermission(role, "profile:read"), `${role} should have profile:read`);
    }
  });

  it("grants profile:write only to writer and admin", () => {
    assert.ok(hasPermission("writer", "profile:write"));
    assert.ok(hasPermission("admin", "profile:write"));
    assert.ok(!hasPermission("partner", "profile:write"));
    assert.ok(!hasPermission("industry_professional", "profile:write"));
  });

  it("grants admin:* permissions only to admin", () => {
    const adminPerms: Permission[] = [
      "admin:competitions",
      "admin:coverage",
      "admin:industry",
      "admin:programs",
      "admin:users",
      "admin:notifications",
      "admin:search",
      "admin:feature-flags",
      "admin:security",
    ];
    for (const perm of adminPerms) {
      assert.ok(hasPermission("admin", perm), `admin should have ${perm}`);
      assert.ok(!hasPermission("writer", perm), `writer should NOT have ${perm}`);
      assert.ok(!hasPermission("partner", perm), `partner should NOT have ${perm}`);
      assert.ok(!hasPermission("industry_professional", perm), `industry_professional should NOT have ${perm}`);
    }
  });

  it("grants partner:competitions:manage to partner and admin", () => {
    assert.ok(hasPermission("partner", "partner:competitions:manage"));
    assert.ok(hasPermission("admin", "partner:competitions:manage"));
    assert.ok(!hasPermission("writer", "partner:competitions:manage"));
    assert.ok(!hasPermission("industry_professional", "partner:competitions:manage"));
  });

  it("grants industry:talent:search to industry_professional and admin", () => {
    assert.ok(hasPermission("industry_professional", "industry:talent:search"));
    assert.ok(hasPermission("admin", "industry:talent:search"));
    assert.ok(!hasPermission("writer", "industry:talent:search"));
    assert.ok(!hasPermission("partner", "industry:talent:search"));
  });

  it("grants submission:read to writer, admin, and partner but not industry_professional", () => {
    assert.ok(hasPermission("writer", "submission:read"));
    assert.ok(hasPermission("admin", "submission:read"));
    assert.ok(hasPermission("partner", "submission:read"));
    assert.ok(!hasPermission("industry_professional", "submission:read"));
  });

  it("grants feedback:write only to writer and admin", () => {
    assert.ok(hasPermission("writer", "feedback:write"));
    assert.ok(hasPermission("admin", "feedback:write"));
    assert.ok(!hasPermission("partner", "feedback:write"));
    assert.ok(!hasPermission("industry_professional", "feedback:write"));
  });
});

// ── hasRole ─────────────────────────────────────────────────────────────────

describe("hasRole", () => {
  it("any role satisfies the 'writer' requirement (base role)", () => {
    for (const role of ROLES) {
      assert.ok(hasRole(role, "writer"), `${role} should satisfy writer requirement`);
    }
  });

  it("admin satisfies any role requirement", () => {
    for (const required of ROLES) {
      assert.ok(hasRole("admin", required), `admin should satisfy ${required} requirement`);
    }
  });

  it("writer does not satisfy admin requirement", () => {
    assert.ok(!hasRole("writer", "admin"));
  });

  it("writer does not satisfy partner requirement", () => {
    assert.ok(!hasRole("writer", "partner"));
  });

  it("partner satisfies own role", () => {
    assert.ok(hasRole("partner", "partner"));
  });

  it("industry_professional satisfies own role", () => {
    assert.ok(hasRole("industry_professional", "industry_professional"));
  });

  it("partner does not satisfy industry_professional requirement", () => {
    assert.ok(!hasRole("partner", "industry_professional"));
  });

  it("industry_professional does not satisfy partner requirement", () => {
    assert.ok(!hasRole("industry_professional", "partner"));
  });
});

// ── Constants ───────────────────────────────────────────────────────────────

describe("ROLES constant", () => {
  it("contains exactly 4 roles", () => {
    assert.equal(ROLES.length, 4);
  });

  it("includes writer, admin, partner, industry_professional", () => {
    assert.deepEqual([...ROLES], ["writer", "admin", "partner", "industry_professional"]);
  });
});

describe("PERMISSIONS constant", () => {
  it("has entries for all expected permissions", () => {
    const keys = Object.keys(PERMISSIONS);
    assert.ok(keys.length >= 15, `Expected at least 15 permissions, got ${keys.length}`);
  });

  it("every permission value is an array of valid roles", () => {
    for (const [perm, roles] of Object.entries(PERMISSIONS)) {
      assert.ok(Array.isArray(roles), `${perm} should have an array of roles`);
      for (const role of roles) {
        assert.ok((ROLES as readonly string[]).includes(role), `${perm} has invalid role: ${role}`);
      }
    }
  });
});
