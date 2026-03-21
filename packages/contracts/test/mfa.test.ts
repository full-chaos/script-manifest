import assert from "node:assert/strict";
import test from "node:test";
import {
  MfaVerifySetupRequestSchema,
  MfaDisableRequestSchema,
  MfaStatusResponseSchema,
  MfaRequiredResponseSchema
} from "../src/mfa.js";

test("MfaVerifySetupRequestSchema accepts six digit code", () => {
  const parsed = MfaVerifySetupRequestSchema.parse({ code: "123456" });
  assert.equal(parsed.code, "123456");
});

test("MfaVerifySetupRequestSchema rejects non-numeric codes", () => {
  const result = MfaVerifySetupRequestSchema.safeParse({ code: "12ab56" });
  assert.equal(result.success, false);
});

test("MfaDisableRequestSchema requires password and code", () => {
  const valid = MfaDisableRequestSchema.safeParse({ password: "pass", code: "111111" });
  const invalid = MfaDisableRequestSchema.safeParse({ password: "", code: "111111" });
  assert.equal(valid.success, true);
  assert.equal(invalid.success, false);
});

test("MfaStatusResponseSchema validates nullable enabledAt", () => {
  const parsed = MfaStatusResponseSchema.parse({ mfaEnabled: false, enabledAt: null });
  assert.equal(parsed.enabledAt, null);
});

test("MfaRequiredResponseSchema enforces requiresMfa=true", () => {
  const valid = MfaRequiredResponseSchema.safeParse({ requiresMfa: true, mfaToken: "token_1" });
  const invalid = MfaRequiredResponseSchema.safeParse({ requiresMfa: false, mfaToken: "token_1" });
  assert.equal(valid.success, true);
  assert.equal(invalid.success, false);
});
