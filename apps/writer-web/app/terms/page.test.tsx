import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TermsPage from "./page";

describe("TermsPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = vi.fn();
  });

  it("renders legal terms content", () => {
    render(<TermsPage />);

    expect(screen.getByText("Terms of Service")).toBeInTheDocument();
    expect(screen.getByText("1. Acceptance of Terms")).toBeInTheDocument();
  });
});
