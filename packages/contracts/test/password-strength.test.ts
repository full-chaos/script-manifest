import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { AuthRegisterRequestSchema, AuthLoginRequestSchema, ResetPasswordRequestSchema, StrongPasswordSchema } from "../src/auth.js";

const VALID_REGISTER_BASE = {
  email: "test@example.com",
  displayName: "Test User",
  acceptTerms: true as const,
};

describe("StrongPasswordSchema", () => {
  it("accepts a strong password", () => {
    const result = StrongPasswordSchema.safeParse("Str0ng!Pass");
    assert.equal(result.success, true);
  });

  it("rejects password missing uppercase", () => {
    const result = StrongPasswordSchema.safeParse("str0ng!pass");
    assert.equal(result.success, false);
    const messages = result.error!.issues.map((i) => i.message);
    assert.ok(messages.some((m) => m.includes("uppercase")), `Expected uppercase error, got: ${messages.join(", ")}`);
  });

  it("rejects password missing number", () => {
    const result = StrongPasswordSchema.safeParse("Strong!Pass");
    assert.equal(result.success, false);
    const messages = result.error!.issues.map((i) => i.message);
    assert.ok(messages.some((m) => m.includes("number")), `Expected number error, got: ${messages.join(", ")}`);
  });

  it("rejects password missing special character", () => {
    const result = StrongPasswordSchema.safeParse("Str0ngPass");
    assert.equal(result.success, false);
    const messages = result.error!.issues.map((i) => i.message);
    assert.ok(messages.some((m) => m.includes("special")), `Expected special char error, got: ${messages.join(", ")}`);
  });

  it("rejects password shorter than 8 characters", () => {
    const result = StrongPasswordSchema.safeParse("Ab1!");
    assert.equal(result.success, false);
    const messages = result.error!.issues.map((i) => i.message);
    assert.ok(messages.some((m) => m.includes("8 characters")), `Expected length error, got: ${messages.join(", ")}`);
  });

  it("rejects a common password", () => {
    const result = StrongPasswordSchema.safeParse("password");
    assert.equal(result.success, false);
    const messages = result.error!.issues.map((i) => i.message);
    assert.ok(messages.some((m) => m.includes("commonly used")), `Expected common password error, got: ${messages.join(", ")}`);
  });
});

describe("AuthRegisterRequestSchema", () => {
  it("accepts a strong password", () => {
    const result = AuthRegisterRequestSchema.safeParse({
      ...VALID_REGISTER_BASE,
      password: "Str0ng!Pass",
    });
    assert.equal(result.success, true);
  });

  it("rejects a weak password (no uppercase, no special)", () => {
    const result = AuthRegisterRequestSchema.safeParse({
      ...VALID_REGISTER_BASE,
      password: "weakpass1",
    });
    assert.equal(result.success, false);
    const messages = result.error!.issues.map((i) => i.message);
    assert.ok(messages.some((m) => m.includes("uppercase")), `Expected uppercase error, got: ${messages.join(", ")}`);
  });

  it("rejects a common password", () => {
    const result = AuthRegisterRequestSchema.safeParse({
      ...VALID_REGISTER_BASE,
      password: "123456",
    });
    assert.equal(result.success, false);
  });
});

describe("AuthLoginRequestSchema — must NOT enforce strength", () => {
  it("accepts a weak password (existing users must still log in)", () => {
    const result = AuthLoginRequestSchema.safeParse({
      email: "test@example.com",
      password: "weakpass1",
    });
    assert.equal(result.success, true, "Login schema must accept weak passwords");
  });

  it("accepts a password without uppercase", () => {
    const result = AuthLoginRequestSchema.safeParse({
      email: "test@example.com",
      password: "alllowercase1",
    });
    assert.equal(result.success, true, "Login schema must not require uppercase");
  });
});

describe("ResetPasswordRequestSchema", () => {
  it("accepts a strong password", () => {
    const result = ResetPasswordRequestSchema.safeParse({
      token: "reset-token-abc",
      password: "Str0ng!Pass",
    });
    assert.equal(result.success, true);
  });

  it("rejects a weak password", () => {
    const result = ResetPasswordRequestSchema.safeParse({
      token: "reset-token-abc",
      password: "weakpass1",
    });
    assert.equal(result.success, false);
  });
});
