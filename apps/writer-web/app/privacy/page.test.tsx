import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PrivacyPage from "./page";

describe("PrivacyPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = vi.fn();
  });

  it("renders privacy policy content", () => {
    render(<PrivacyPage />);

    expect(screen.getByText("Privacy Policy")).toBeInTheDocument();
    expect(screen.getByText("1. Data We Collect")).toBeInTheDocument();
  });
});
