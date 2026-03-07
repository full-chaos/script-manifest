import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renderTemplate } from "./templates.js";

describe("renderTemplate", () => {
  describe("verification-code", () => {
    it("includes the code in subject and body", () => {
      const result = renderTemplate("verification-code", { code: "123456", displayName: "Alice" });
      assert.ok(result.subject.includes("123456"));
      assert.ok(result.html.includes("123456"));
      assert.ok(result.text.includes("123456"));
    });

    it("includes the display name", () => {
      const result = renderTemplate("verification-code", { code: "999999", displayName: "Bob" });
      assert.ok(result.html.includes("Bob"));
      assert.ok(result.text.includes("Bob"));
    });

    it("uses defaults when data is missing", () => {
      const result = renderTemplate("verification-code", {});
      assert.ok(result.subject.includes("000000"));
      assert.ok(result.html.includes("Writer"));
    });
  });

  describe("password-reset", () => {
    it("includes the reset URL", () => {
      const url = "https://scriptmanifest.com/reset?token=abc123";
      const result = renderTemplate("password-reset", { resetUrl: url, displayName: "Charlie" });
      assert.ok(result.html.includes(url));
      assert.ok(result.text.includes(url));
      assert.ok(result.html.includes("Charlie"));
    });

    it("has a consistent subject", () => {
      const result = renderTemplate("password-reset", { resetUrl: "https://example.com", displayName: "D" });
      assert.equal(result.subject, "Reset your Script Manifest password");
    });
  });

  describe("welcome", () => {
    it("includes the display name", () => {
      const result = renderTemplate("welcome", { displayName: "Eve" });
      assert.ok(result.subject.includes("Welcome"));
      assert.ok(result.html.includes("Eve"));
      assert.ok(result.text.includes("Eve"));
    });

    it("mentions next steps", () => {
      const result = renderTemplate("welcome", { displayName: "Frank" });
      assert.ok(result.text.includes("writer profile"));
      assert.ok(result.text.includes("script"));
    });
  });
});
