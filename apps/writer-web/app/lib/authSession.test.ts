import { describe, expect, it } from "vitest";
import { formatUserLabel } from "./authSession";

describe("formatUserLabel", () => {
  it("formats display name and email together", () => {
    const label = formatUserLabel({
      id: "u1",
      email: "test@x.com",
      displayName: "Test User",
      emailVerified: false,
    });

    expect(label).toBe("Test User (test@x.com)");
  });
});
